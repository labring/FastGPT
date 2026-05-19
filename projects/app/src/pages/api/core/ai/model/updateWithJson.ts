import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/type';
import { Types } from '@fastgpt/service/common/mongo';

export type updateWithJsonQuery = {};

export type updateWithJsonBody = {
  config: string;
};

export type updateWithJsonResponse = {};

export type SystemModelConfigJsonItem = {
  id?: string;
  model: string;
  metadata: SystemModelItemType;
  isShared?: boolean;
  tmbId?: string;
  teamId?: string;
};

async function handler(
  req: ApiRequestProps<updateWithJsonBody, updateWithJsonQuery>,
  res: ApiResponseType<any>
): Promise<updateWithJsonResponse> {
  await authSystemAdmin({ req });

  const { config } = req.body;
  const data = JSON.parse(config) as SystemModelConfigJsonItem[];

  // Check
  for (const item of data) {
    if (!item.model || !item.metadata || typeof item.metadata !== 'object') {
      return Promise.reject('Invalid model or metadata');
    }
    if (!item.metadata.type) {
      return Promise.reject(`${item.model} metadata.type is required`);
    }
    if (!item.metadata.model) {
      return Promise.reject(`${item.model} metadata.model is required`);
    }
    if (!item.metadata.provider) {
      return Promise.reject(`${item.model} metadata.provider is required`);
    }
    item.model = item.model.trim();
    item.metadata.model = item.model;
    if (!item.metadata.name) {
      item.metadata.name = item.model;
    }
    if (item.id && !Types.ObjectId.isValid(item.id)) {
      return Promise.reject(`${item.model} id is invalid`);
    }
    if (item.tmbId && !Types.ObjectId.isValid(item.tmbId)) {
      return Promise.reject(`${item.model} tmbId is invalid`);
    }
    if (item.teamId && !Types.ObjectId.isValid(item.teamId)) {
      return Promise.reject(`${item.model} teamId is invalid`);
    }
  }

  await mongoSessionRun(async (session) => {
    await MongoSystemModel.deleteMany({}, { session });
    for await (const item of data) {
      const _id = item.id ? new Types.ObjectId(item.id) : new Types.ObjectId();
      await MongoSystemModel.create(
        [
          {
            _id,
            model: item.model,
            metadata: item.metadata,
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

  return {};
}

export default NextAPI(handler);
