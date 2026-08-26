import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateSystemModelsWithJsonBodySchema,
  UpdateSystemModelsWithJsonResponseSchema,
  type UpdateSystemModelsWithJsonBody,
  type UpdateSystemModelsWithJsonResponse
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { repairSystemModelDocument } from '@fastgpt/service/core/ai/config/repair';
import { getPluginSystemModelDocuments } from '@fastgpt/service/core/ai/config/utils';
import { UserError } from '@fastgpt/global/common/error/utils';

export type updateWithJsonBody = UpdateSystemModelsWithJsonBody;

async function handler(
  req: ApiRequestProps<updateWithJsonBody>
): Promise<UpdateSystemModelsWithJsonResponse> {
  await authSystemAdmin({ req });

  const { config } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelsWithJsonBodySchema
  }).body;
  const pluginDocuments = await getPluginSystemModelDocuments();
  const pluginMap = new Map(pluginDocuments.map((item) => [item.model, item]));
  const repairedModels = config.map((item) => {
    const modelName = typeof item.model === 'string' ? item.model.trim() : '';
    return repairSystemModelDocument({
      record: item,
      pluginDocument: pluginMap.get(modelName)
    });
  });
  const invalidIndex = repairedModels.findIndex((item) => item.status === 'invalid');
  if (invalidIndex >= 0) {
    const invalid = repairedModels[invalidIndex];
    throw new UserError(
      `Invalid system model at index ${invalidIndex}: ${JSON.stringify(invalid.issues)}`
    );
  }
  const persistedModels = repairedModels.map((item) => {
    if (item.status === 'invalid') throw new Error('Unexpected invalid system model');
    return item.document;
  });
  const configuredModels = persistedModels.map((item) => item.model);

  await mongoSessionRun(async (session) => {
    // modelId 是业务引用，批量替换配置时不能删除并重建文档。未提交的模型仅停用，
    // 后续再次加入配置时仍复用原 _id。
    await MongoSystemModel.updateMany(
      { model: { $nin: configuredModels } },
      { $set: { isActive: false } },
      { session }
    );
    if (persistedModels.length > 0) {
      await MongoSystemModel.bulkWrite(
        persistedModels.map((item) => ({
          updateOne: {
            filter: { model: item.model },
            update: { $set: item },
            upsert: true
          }
        })),
        { session }
      );
    }
  });

  await updatedReloadSystemModel();

  return UpdateSystemModelsWithJsonResponseSchema.parse(undefined);
}

export default NextAPI(handler);
