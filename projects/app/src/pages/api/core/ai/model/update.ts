import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import {
  WritePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import {
  UpdateModelBodySchema,
  UpdateModelResponseSchema,
  type UpdateModelBody,
  type UpdateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { replaceResourceClbs } from '@fastgpt/service/support/permission/inheritPermission';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { findReferencingResources } from '@fastgpt/service/support/permission/model/reference';
import { jsonRes } from '@fastgpt/service/common/response';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

const buildModelUpdate = ({
  fields,
  modelItem
}: {
  fields: Record<string, any>;
  modelItem: { id: string; model: string; type: string; isCustom?: boolean };
}) => {
  const $set: Record<string, any> = {};
  const $unset: Record<string, 1> = {};

  const nextModel = typeof fields.model === 'string' ? fields.model.trim() : undefined;
  if (nextModel !== undefined) {
    if (modelItem.isCustom !== true && nextModel !== modelItem.model) {
      throw new Error(ModelErrEnum.systemModelNotSupportUpdate);
    }
    $set.model = nextModel;
  }

  const usePriceTiers = modelItem.type === 'llm' && Array.isArray(fields.priceTiers);

  for (const [key, rawValue] of Object.entries(fields)) {
    if (['id', 'model', 'isCustom', 'tmbId', 'teamId'].includes(key)) continue;
    if (usePriceTiers && ['charsPointsPrice', 'inputPrice', 'outputPrice'].includes(key)) continue;

    const value = key === 'name' && typeof rawValue === 'string' ? rawValue.trim() : rawValue;

    if (value === null || value === undefined) {
      $unset[key] = 1;
      continue;
    }

    $set[key] = value;
  }

  if (usePriceTiers) {
    $unset.charsPointsPrice = 1;
    $unset.inputPrice = 1;
    $unset.outputPrice = 1;
  }

  return { $set, $unset };
};

async function handler(
  req: ApiRequestProps<UpdateModelBody, any>,
  res: ApiResponseType<any>
): Promise<UpdateModelResponse> {
  const parsed = UpdateModelBodySchema.parse(req.body);
  const { id, isShared, ...fields } = parsed;

  const {
    model: modelItem,
    teamId,
    tmbId
  } = await authModel({
    req,
    authToken: true,
    authApiKey: true,
    modelId: id,
    per: WritePermissionVal
  });

  const updateData: Record<string, any> = {};

  if (Object.keys(fields).length > 0) {
    const { $set, $unset } = buildModelUpdate({
      fields,
      modelItem
    });

    if (Object.keys($set).length > 0) updateData.$set = $set;
    if (Object.keys($unset).length > 0) updateData.$unset = $unset;
  }

  if (isShared !== undefined) {
    // When changing from public to private, check if the model is referenced by shared resources
    if (isShared === false && modelItem.isShared === true) {
      const references = await findReferencingResources(id, teamId);
      if (references.length > 0) {
        jsonRes(res, {
          code: 409,
          data: { references },
          message: i18nT('account_model:model_referenced_by_resources')
        });
        return UpdateModelResponseSchema.parse({});
      }
    }

    updateData.$set = { ...(updateData.$set || {}), isShared };

    // When changing a private model to public, remove all collaborator configurations.
    // Uses the same replaceResourceClbs as collaborator/update.ts to preserve owner records.
    if (isShared) {
      await mongoSessionRun((session) =>
        replaceResourceClbs({
          resourceType: PerResourceTypeEnum.model,
          teamId,
          resourceId: modelItem.id,
          collaborators: [],
          session
        })
      );
    }
  }

  if (Object.keys(updateData).length === 0) {
    return UpdateModelResponseSchema.parse({});
  }

  // When setting isShared to false, use findOneAndUpdate to atomically verify
  // the model is still shared, preventing TOCTOU race with concurrent requests.
  if (isShared === false) {
    const result = await MongoSystemModel.findOneAndUpdate(
      { _id: modelItem.id, isShared: true },
      updateData
    );
    if (!result) {
      // Another request already changed isShared; reload cache and return
      await updatedReloadSystemModel();
      return UpdateModelResponseSchema.parse({});
    }
  } else {
    await MongoSystemModel.updateOne({ _id: modelItem.id }, updateData);
  }

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      teamId,
      tmbId,
      event: AuditEventEnum.UPDATE_MODEL,
      params: { modelName: modelItem.name, modelType: getI18nModelType(modelItem.type) }
    });
  })();

  return UpdateModelResponseSchema.parse({});
}

export default NextAPI(handler);
