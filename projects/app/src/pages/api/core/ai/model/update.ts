import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/type';
import {
  UpdateModelBodySchema,
  UpdateModelResponseSchema,
  type UpdateModelBody,
  type UpdateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

const ignoredMetadataKeys = new Set([
  'avatar',
  'id',
  'isShared',
  'permission',
  'sourceMember',
  'teamId',
  'tmbId'
]);

const buildMetadataUpdate = ({
  metadata,
  modelItem
}: {
  metadata: Record<string, any>;
  modelItem: Pick<SystemModelItemType, 'model' | 'type' | 'isCustom'>;
}) => {
  const nextModel = typeof metadata.model === 'string' ? metadata.model.trim() : modelItem.model;

  if (!nextModel) {
    throw new Error(ModelErrEnum.metadataModelRequired);
  }
  if (modelItem.isCustom !== true && nextModel !== modelItem.model) {
    throw new Error(ModelErrEnum.systemModelNotSupportUpdate);
  }

  const $set: Record<string, any> = {
    model: modelItem.isCustom === true ? nextModel : modelItem.model,
    'metadata.model': modelItem.isCustom === true ? nextModel : modelItem.model,
    'metadata.isCustom': modelItem.isCustom === true
  };
  const $unset: Record<string, 1> = {};
  const usePriceTiers = modelItem.type === 'llm' && Array.isArray(metadata.priceTiers);

  for (const [key, rawValue] of Object.entries(metadata)) {
    if (ignoredMetadataKeys.has(key)) continue;

    if (key === 'model' || key === 'isCustom') {
      continue;
    }
    if (usePriceTiers && ['charsPointsPrice', 'inputPrice', 'outputPrice'].includes(key)) {
      continue;
    }

    const value = key === 'name' && typeof rawValue === 'string' ? rawValue.trim() : rawValue;

    if (value === null || value === undefined) {
      $unset[`metadata.${key}`] = 1;
      continue;
    }

    $set[`metadata.${key}`] = value;
  }

  if (usePriceTiers) {
    $unset['metadata.charsPointsPrice'] = 1;
    $unset['metadata.inputPrice'] = 1;
    $unset['metadata.outputPrice'] = 1;
  }

  return { $set, $unset };
};

async function handler(
  req: ApiRequestProps<UpdateModelBody, any>,
  res: ApiResponseType<any>
): Promise<UpdateModelResponse> {
  const { id, metadata, isShared } = UpdateModelBodySchema.parse(req.body);
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

  if (metadata && Object.keys(metadata).length > 0) {
    const { $set, $unset } = buildMetadataUpdate({
      metadata,
      modelItem
    });

    updateData.$set = $set;
    updateData.$unset = $unset;
  }

  if (isShared !== undefined) {
    updateData.$set = {
      ...(updateData.$set || {}),
      isShared
    };
  }

  if (Object.keys(updateData).length === 0) {
    return UpdateModelResponseSchema.parse({});
  }

  await MongoSystemModel.updateOne({ _id: modelItem.id }, updateData);

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
