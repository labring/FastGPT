import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ImportedSystemModelSchema,
  UpdateSystemModelsWithJsonBodySchema,
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

  const latestRecords = config.flatMap((record) => {
    const modelId = record.modelId;
    return typeof modelId === 'string' && modelId.trim().length > 0
      ? [{ record, modelId: modelId.trim() }]
      : [];
  });
  // 非空旧配置全部缺少 modelId 时按“过滤旧数据”处理，不能意外停用全部现有模型。
  if (config.length > 0 && latestRecords.length === 0) return;

  const assertNoDuplicateIds = (models: Array<{ modelId: string }>) => {
    const modelIds = new Set<string>();
    for (const model of models) {
      if (modelIds.has(model.modelId)) throw new UserError(`Duplicate modelId: ${model.modelId}`);
      modelIds.add(model.modelId);
    }
  };
  assertNoDuplicateIds(latestRecords);

  const existingModels = await MongoAIModel.find(
    { scope: ModelScopeEnum.system },
    '_id model'
  ).lean();
  const existingModelMap = new Map(existingModels.map((model) => [String(model._id), model.model]));
  const importedModels = latestRecords.map(({ record, modelId }, index) => {
    const existingModel = existingModelMap.get(modelId);
    // 本地模型的调用标识不可变，导入时在完整校验前用持久化值覆盖输入。
    const parsed = ImportedSystemModelSchema.safeParse(
      existingModel ? { ...record, modelId, model: existingModel } : { ...record, modelId }
    );
    if (!parsed.success) {
      throw new UserError(`Invalid system model at index ${index}: ${parsed.error.message}`);
    }
    return parsed.data;
  });

  const resolvedModels = importedModels.map(({ modelId, ...modelData }) => {
    const existingModel = existingModelMap.get(modelId);
    if (!existingModel) {
      return {
        modelId,
        model: modelData.model,
        modelData,
        isExistingId: false
      };
    }

    // 本实例 ID 命中时，配置中的 model 仅用于导入记录识别，不能修改已有模型标识。
    const { model: _importedModel, ...editableModelData } = modelData;
    return {
      modelId,
      model: existingModel,
      modelData: editableModelData,
      isExistingId: true
    };
  });

  const modelNames = new Set<string>();
  for (const model of resolvedModels) {
    if (modelNames.has(model.model)) throw new UserError(`Duplicate model: ${model.model}`);
    modelNames.add(model.model);
  }
  const configuredModels = resolvedModels.map((model) => model.model);

  await mongoSessionRun(async (session) => {
    await MongoAIModel.updateMany(
      { scope: ModelScopeEnum.system, model: { $nin: configuredModels } },
      { $set: { isActive: false } },
      { session }
    );

    if (importedModels.length === 0) return;
    await MongoAIModel.bulkWrite(
      resolvedModels.map(({ modelId, model, modelData, isExistingId }) => ({
        updateOne: {
          filter: isExistingId
            ? { _id: modelId, scope: ModelScopeEnum.system }
            : { scope: ModelScopeEnum.system, model },
          update: { $set: modelData },
          upsert: !isExistingId
        }
      })),
      { session }
    );
  });

  await updatedReloadSystemModel();
}

export default NextAPI(handler);
