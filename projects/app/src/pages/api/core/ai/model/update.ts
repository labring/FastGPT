import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { normalizeSystemModel } from '@fastgpt/service/core/ai/model/normalize';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isObjectId } from '@fastgpt/global/common/string/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateModelBodySchema,
  UpdateModelResponseSchema,
  type UpdateModelBody,
  type UpdateModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<UpdateModelBody>,
  _res: ApiResponseType<any>
): Promise<UpdateModelResponse> {
  const body = parseApiInput({ req, bodySchema: UpdateModelBodySchema }).body;
  const { id: modelId, type: bodyType, ...updates } = body;

  if (!modelId || !isObjectId(modelId)) {
    return Promise.reject(ModelErrEnum.invalidModelId);
  }

  if (Object.keys(updates).length === 0 && !bodyType) {
    return Promise.reject(ModelErrEnum.noFieldsToUpdate);
  }

  const {
    teamId,
    tmbId,
    modelData: existingModel,
    isRoot
  } = await authModel({
    modelId,
    per: WritePermissionVal,
    req,
    authToken: true
  });

  // Non-root users cannot change price fields or isSystem (price is a platform-wide
  // config, isSystem decides ownership); they MAY toggle isActive to start/stop
  // their own private models (decision: non-root can enable/disable own models).
  if (!isRoot) {
    delete updates.charsPointsPrice;
    delete updates.priceTiers;
    delete updates.inputPrice;
    delete updates.outputPrice;
    delete updates.isSystem;
  }

  // System models do not maintain tmbId/teamId (design data-model §1.2):
  // strip them from updates to prevent re-attaching team ownership to system models.
  if (existingModel.isSystem) {
    delete updates.tmbId;
    delete updates.teamId;
  }

  // Validate and clean via the type-specific Zod schema.
  // Partial mode: the update body schema (UpdateModelBodySchema) is fully partial
  // (toggle switches send only { id, isActive }), so don't require all fields.
  const normalized = normalizeSystemModel(
    {
      ...updates,
      type: bodyType ?? existingModel.type
    },
    { partial: true }
  );

  // Strip fields that should not be directly written
  delete normalized.id;
  delete normalized._id;
  delete normalized.createdAt;
  delete normalized.updatedAt;
  delete normalized.__v;
  delete normalized.tmbId;
  delete normalized.teamId;
  delete normalized.isSystem;

  const fieldsToUpdate = Object.keys(normalized);
  if (fieldsToUpdate.length === 0) {
    return Promise.reject(ModelErrEnum.noFieldsToUpdate);
  }

  await MongoSystemModel.updateOne({ _id: modelId }, { $set: normalized });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_MODEL,
      params: {
        modelName: existingModel.name || existingModel.model,
        modelType: getI18nModelType(existingModel.type)
      }
    });
  })();

  return UpdateModelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
