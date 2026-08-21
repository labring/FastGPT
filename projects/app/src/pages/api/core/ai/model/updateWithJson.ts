import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import {
  parsePersistedSystemModelConfig,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelsWithJsonBodySchema,
  UpdateSystemModelsWithJsonResponseSchema,
  type UpdateSystemModelsWithJsonBody,
  type UpdateSystemModelsWithJsonResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

export type updateWithJsonBody = UpdateSystemModelsWithJsonBody;

async function handler(
  req: ApiRequestProps<updateWithJsonBody>
): Promise<UpdateSystemModelsWithJsonResponse> {
  await authSystemAdmin({ req });

  const { config } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelsWithJsonBodySchema
  }).body;
  const data = config.map(({ model, metadata }) => ({
    model,
    metadata: parsePersistedSystemModelConfig({ model, metadata })
  }));

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

  return UpdateSystemModelsWithJsonResponseSchema.parse(undefined);
}

export default NextAPI(handler);
