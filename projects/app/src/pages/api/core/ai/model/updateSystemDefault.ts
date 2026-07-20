import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDefaultModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemDefaultModelBodySchema,
  UpdateSystemDefaultModelResponseSchema,
  type UpdateSystemDefaultModelBody,
  type UpdateSystemDefaultModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { Types } from '@fastgpt/service/common/mongo';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { isObjectId } from '@fastgpt/global/common/string/utils';

async function handler(
  req: ApiRequestProps<UpdateSystemDefaultModelBody, Record<string, never>>
): Promise<UpdateSystemDefaultModelResponse> {
  const { tmbId, teamId, isRoot } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  if (!isRoot) {
    return Promise.reject(ModelErrEnum.rootOnlyPermit);
  }

  const body = parseApiInput({
    req,
    bodySchema: UpdateSystemDefaultModelBodySchema
  }).body;

  // Build flat fields for default_models collection
  const updateFields: Record<string, string | null> = {};
  const mappings: (keyof typeof body)[] = [
    'llmId',
    'embeddingId',
    'ttsId',
    'sttId',
    'rerankId',
    'datasetTextLLMId',
    'datasetImageLLMId',
    'chatTitleLLMId',
    'helperBotLLMId'
  ];

  for (const key of mappings) {
    const value = body[key];
    if (value !== undefined) {
      updateFields[key] = value; // null means unset this default
    }
  }

  // System defaults may only reference active system models (design §7.7).
  const modelIdsToCheck = Object.values(updateFields).filter(
    (id): id is string => typeof id === 'string' && !!id
  );
  if (modelIdsToCheck.some((id) => !isObjectId(id))) {
    // Not a valid ObjectId → cannot be an active system model
    return Promise.reject(ModelErrEnum.invalidModelConfig);
  }
  if (modelIdsToCheck.length > 0) {
    const found = await MongoSystemModel.find({
      _id: { $in: modelIdsToCheck.map((id) => new Types.ObjectId(id)) },
      isActive: true,
      isSystem: true
    })
      .select('_id')
      .lean();
    const foundIds = new Set(found.map((m) => String(m._id)));
    const invalidIds = modelIdsToCheck.filter((id) => !foundIds.has(id));
    if (invalidIds.length > 0) {
      return Promise.reject(ModelErrEnum.invalidModelConfig);
    }
  }

  // Upsert into the singleton default_models document
  await MongoDefaultModel.updateOne({}, { $set: updateFields }, { upsert: true });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_SYSTEM_MODEL_DEFAULT,
      params: {}
    });
  })();

  return UpdateSystemDefaultModelResponseSchema.parse(undefined);
}

export default NextAPI(handler);
