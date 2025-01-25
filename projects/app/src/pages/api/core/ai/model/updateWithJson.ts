import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { SystemModelSchemaType } from '@fastgpt/service/core/ai/type';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';

export type updateWithJsonQuery = {};

export type updateWithJsonBody = {
  config: string;
};

export type updateWithJsonResponse = {};

async function handler(
  req: ApiRequestProps<updateWithJsonBody, updateWithJsonQuery>,
  res: ApiResponseType<any>
): Promise<updateWithJsonResponse> {
  await authSystemAdmin({ req });

  const { config } = req.body;
  const data = JSON.parse(config) as SystemModelSchemaType[];

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
    item.metadata.model = item.model.trim();
    if (!item.metadata.name) {
      item.metadata.name = item.model;
    }
  }

  await mongoSessionRun(async (session) => {
    await MongoSystemModel.deleteMany({}, { session });
    for await (const item of data) {
      await MongoSystemModel.updateOne(
        { model: item.model },
        { $set: { model: item.model, metadata: item.metadata } },
        { upsert: true, session }
      );
    }
  });

  await updatedReloadSystemModel();

  return {};
}

export default NextAPI(handler);
