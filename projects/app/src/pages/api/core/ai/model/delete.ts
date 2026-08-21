import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  ManagePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { authModel } from '@fastgpt/service/support/permission/model/auth';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/model/utils';
import { getModelChannelRefs } from '@fastgpt/service/core/ai/channel';
import { addAuditLog, getI18nModelType } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  DeleteModelQuerySchema,
  DeleteModelResponseSchema,
  type DeleteModelQuery,
  type DeleteModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

async function handler(
  req: ApiRequestProps<Record<string, never>, DeleteModelQuery>,
  _res: ApiResponseType<any>
): Promise<DeleteModelResponse> {
  const { id: modelId } = parseApiInput({
    req,
    querySchema: DeleteModelQuerySchema
  }).query;

  const { modelData, isRoot, tmbId, teamId } = await authModel({
    modelId,
    per: ManagePermissionVal,
    req,
    authToken: true
  });

  // System models (isSystem=true) can only be deleted by root
  if (modelData.isSystem && !isRoot) {
    return Promise.reject(ModelErrEnum.systemModelReadonly);
  }

  // Same-upstream-name channel references in the model's own bucket (F2-S3 hint).
  // Not blocking: channels route by name and keep working independently; on
  // aiproxy failure the count falls back to 0 so the delete still succeeds.
  let refChannelCount = 0;
  try {
    refChannelCount = await getModelChannelRefs(modelData);
  } catch (error) {
    refChannelCount = 0;
  }

  // Delete the model and its collaborator permission records atomically (design §7.5).
  await mongoSessionRun(async (session) => {
    await MongoSystemModel.deleteOne({ _id: modelId }, { session });
    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: modelId
      },
      { session }
    );
  });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_MODEL,
      params: {
        modelName: modelData.name || modelData.model,
        modelType: getI18nModelType(modelData.type)
      }
    });
  })();

  return DeleteModelResponseSchema.parse({ refChannelCount });
}

export default NextAPI(handler);
