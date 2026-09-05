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
import { getSystemModelConfigUpdate } from '@fastgpt/service/core/ai/config/service';

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
    '_id model type'
  ).lean();
  const existingModelMap = new Map(
    existingModels.map((model) => [
      String(model._id),
      { modelId: String(model._id), model: model.model, type: model.type }
    ])
  );
  const existingModelNameMap = new Map(
    existingModels.map((model) => [
      model.model,
      { modelId: String(model._id), model: model.model, type: model.type }
    ])
  );
  const importedModels = latestRecords.map(({ record, modelId }, index) => {
    const existingModel =
      existingModelMap.get(modelId) ??
      (typeof record.model === 'string' ? existingModelNameMap.get(record.model) : undefined);
    // 本地已有模型的调用标识与类型均不可变，导入时在完整校验前使用持久化值覆盖输入。
    const parsed = ImportedSystemModelSchema.safeParse(
      existingModel
        ? {
            ...record,
            modelId,
            model: existingModel.model,
            type: existingModel.type
          }
        : { ...record, modelId }
    );
    if (!parsed.success) {
      throw new UserError(`Invalid system model at index ${index}: ${parsed.error.message}`);
    }
    return { data: parsed.data, existingModel };
  });

  const resolvedModels = importedModels.map(
    ({ data: { modelId: importedModelId, ...modelData }, existingModel }) => {
      if (!existingModel) {
        return {
          modelId: importedModelId,
          model: modelData.model,
          modelData,
          isExistingModel: false
        };
      }

      // 本实例已存在的模型按持久化 ID 更新，导入的 model/type 均不参与写入。
      const { model: _importedModel, ...editableModelData } = modelData;
      return {
        modelId: existingModel.modelId,
        model: existingModel.model,
        modelData: editableModelData,
        isExistingModel: true
      };
    }
  );

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
      resolvedModels.map(({ modelId, model, modelData, isExistingModel }) => ({
        updateOne: {
          filter: isExistingModel
            ? { _id: modelId, scope: ModelScopeEnum.system }
            : { scope: ModelScopeEnum.system, model },
          update: isExistingModel ? getSystemModelConfigUpdate(modelData) : { $set: modelData },
          upsert: !isExistingModel
        }
      })),
      { session }
    );
  });

  await updatedReloadSystemModel();
}

export default NextAPI(handler);
