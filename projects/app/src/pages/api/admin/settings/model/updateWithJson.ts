import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import {
  assertSystemModelTypesMatchPluginTemplates,
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ImportedSystemModelSchema,
  UpdateSystemModelsWithJsonBodySchema,
  type ImportedSystemModel,
  type UpdateSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { UserError } from '@fastgpt/global/common/error/utils';

async function handler(req: ApiRequestProps<UpdateSystemModelsWithJsonBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { config } = parseApiInput({
    req,
    bodySchema: UpdateSystemModelsWithJsonBodySchema
  }).body;

  const latestRecords = config.filter(
    (item) => typeof item.modelId === 'string' && item.modelId.trim().length > 0
  );
  // 非空旧配置全部缺少 modelId 时按“过滤旧数据”处理，不能意外停用全部现有模型。
  if (config.length > 0 && latestRecords.length === 0) return;

  const importedModels = latestRecords.map((record, index) => {
    const parsed = ImportedSystemModelSchema.safeParse(record);
    if (!parsed.success) {
      throw new UserError(`Invalid system model at index ${index}: ${parsed.error.message}`);
    }
    return parsed.data;
  });

  const assertNoDuplicates = (models: ImportedSystemModel[]) => {
    const modelIds = new Set<string>();
    const providerModels = new Set<string>();
    for (const model of models) {
      if (modelIds.has(model.modelId)) throw new UserError(`Duplicate modelId: ${model.modelId}`);
      if (providerModels.has(model.model)) throw new UserError(`Duplicate model: ${model.model}`);
      modelIds.add(model.modelId);
      providerModels.add(model.model);
    }
  };
  assertNoDuplicates(importedModels);

  // 只把当前实例真实存在的 ID 交给 Mongoose，外部系统的任意 string ID 按 model 安装。
  const existingModelIds = new Set(
    (await MongoAIModel.find({ scope: ModelScopeEnum.system }, '_id').lean()).map((model) =>
      String(model._id)
    )
  );
  const configuredModels = importedModels.map((model) => model.model);

  // 插件不可用时不提交数据库更新，保持数据库与当前运行时 active 集合一致。
  const pluginDocuments = await refreshModelTemplates();
  assertSystemModelTypesMatchPluginTemplates({ models: importedModels, pluginDocuments });
  await mongoSessionRun(async (session) => {
    await MongoAIModel.updateMany(
      { scope: ModelScopeEnum.system, model: { $nin: configuredModels } },
      { $set: { isActive: false } },
      { session }
    );

    if (importedModels.length === 0) return;
    await MongoAIModel.bulkWrite(
      importedModels.map(({ modelId, ...modelData }) => ({
        updateOne: {
          filter: existingModelIds.has(modelId)
            ? { _id: modelId, scope: ModelScopeEnum.system }
            : { scope: ModelScopeEnum.system, model: modelData.model },
          update: { $set: modelData },
          upsert: !existingModelIds.has(modelId)
        }
      })),
      { session }
    );
  });

  await updatedReloadSystemModel({ pluginDocuments });
}

export default NextAPI(handler);
