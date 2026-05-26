import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { Types } from '@fastgpt/service/common/mongo';
import {
  UpdateWithJsonBodySchema,
  UpdateWithJsonResponseSchema,
  type UpdateWithJsonBody,
  type UpdateWithJsonResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AdminAuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<UpdateWithJsonBody, any>,
  res: ApiResponseType<any>
): Promise<UpdateWithJsonResponse> {
  const { tmbId, teamId } = await authSystemAdmin({ req });

  const { config } = UpdateWithJsonBodySchema.parse(req.body);
  const data = JSON.parse(config) as Record<string, any>[];

  // Check
  for (const item of data) {
    if (!item.model) {
      return Promise.reject(ModelErrEnum.invalidModelOrMetadata);
    }
    if (!item.type) {
      return Promise.reject(ModelErrEnum.customModelMissingType);
    }
    if (!item.provider) {
      return Promise.reject(ModelErrEnum.metadataProviderRequired);
    }
    item.model = item.model.trim();
    if (!item.name) {
      item.name = item.model;
    }
    if (item.id && !Types.ObjectId.isValid(item.id)) {
      return Promise.reject(ModelErrEnum.invalidModelId);
    }
    if (item.tmbId && !Types.ObjectId.isValid(item.tmbId)) {
      return Promise.reject(ModelErrEnum.invalidTmbId);
    }
    if (item.teamId && !Types.ObjectId.isValid(item.teamId)) {
      return Promise.reject(ModelErrEnum.invalidTeamId);
    }
  }

  await mongoSessionRun(async (session) => {
    await MongoSystemModel.deleteMany({}, { session });
    for await (const item of data) {
      const { id: _idStr, ...fields } = item;
      const _id = _idStr ? new Types.ObjectId(_idStr) : new Types.ObjectId();
      await MongoSystemModel.create(
        [
          {
            _id,
            ...fields,
            isShared: item.isShared ?? false,
            ...(item.tmbId ? { tmbId: new Types.ObjectId(item.tmbId) } : {}),
            ...(item.teamId ? { teamId: new Types.ObjectId(item.teamId) } : {})
          }
        ],
        { session }
      );
    }
  });

  await updatedReloadSystemModel();

  (async () => {
    addAuditLog({
      teamId,
      tmbId,
      event: AdminAuditEventEnum.ADMIN_UPDATE_MODEL_WITH_JSON,
      params: { modelCount: data.length }
    });
  })();

  return UpdateWithJsonResponseSchema.parse({});
}

export default NextAPI(handler);
