import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  normalizeModelPricingForRead,
  normalizeModelPricingForSave
} from '@fastgpt/global/core/ai/model/pricing';
import { type ParsedSystemModelsWithJsonBody } from '@fastgpt/global/openapi/core/ai/model/api';
import { runModelTransaction } from './catalog/transaction';
import { deleteModelRecords } from './cleanup';
import { MongoAIModel } from './schema';
import { updatedReloadSystemModel } from './catalog/service';
import { getModelConfigUpdate } from './utils';

/**
 * 用导入配置替换系统模型集合，保留可匹配实例的稳定 ID，并在同一事务内清理派生权限与探测记录。
 */
export const importSystemModels = async ({ config }: ParsedSystemModelsWithJsonBody) => {
  const latestRecords = config.map((record) => ({ record, modelId: record.modelId }));

  const assertNoDuplicateIds = (models: Array<{ modelId: string }>) => {
    const modelIds = new Set<string>();
    for (const model of models) {
      if (modelIds.has(model.modelId)) throw new UserError(`Duplicate modelId: ${model.modelId}`);
      modelIds.add(model.modelId);
    }
  };
  assertNoDuplicateIds(latestRecords);

  const changes = await runModelTransaction({ scope: ModelScopeEnum.system }, async (session) => {
    const existingModels = await MongoAIModel.find(
      { scope: ModelScopeEnum.system },
      '_id model type'
    )
      .session(session)
      .lean();
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
    const resolvedLocalModelIds = new Set<string>();

    const importedModels = latestRecords.map(({ record, modelId }) => {
      const existingByModelId = existingModelMap.get(modelId);
      const existingByModelName =
        typeof record.model === 'string' ? existingModelNameMap.get(record.model) : undefined;
      const existingModel = existingByModelId ?? existingByModelName;

      if (existingModel) {
        if (resolvedLocalModelIds.has(existingModel.modelId)) {
          throw new UserError(
            `Conflicting import: multiple records map to local model ${existingModel.modelId}`
          );
        }
        resolvedLocalModelIds.add(existingModel.modelId);
      }

      if (existingModel && existingModel.type !== record.type) {
        throw new UserError(`Model type cannot be changed: ${modelId}`);
      }
      return { data: record, existingModel };
    });

    const resolvedModels = importedModels.map(
      ({ data: { modelId: importedModelId, ...importedData }, existingModel }) => {
        const modelData = normalizeModelPricingForSave(normalizeModelPricingForRead(importedData));
        if (!existingModel) {
          return {
            modelId: importedModelId,
            model: modelData.model,
            modelData,
            isExistingModel: false
          };
        }

        const targetModel = modelData.model;
        return {
          modelId: existingModel.modelId,
          model: targetModel,
          modelData: { ...modelData, model: targetModel },
          isExistingModel: true
        };
      }
    );

    const modelNames = new Set<string>();
    for (const model of resolvedModels) {
      if (modelNames.has(model.model)) throw new UserError(`Duplicate model: ${model.model}`);
      modelNames.add(model.model);

      const conflictingModel = existingModelNameMap.get(model.model);
      if (conflictingModel && conflictingModel.modelId !== model.modelId) {
        throw new UserError(`Model identifier already in use: ${model.model}`);
      }
    }

    const retainedModelIds = new Set(
      resolvedModels.filter((model) => model.isExistingModel).map((model) => model.modelId)
    );
    const removedModelIds = existingModels
      .filter(({ _id }) => !retainedModelIds.has(String(_id)))
      .map(({ _id }) => _id);
    await deleteModelRecords(removedModelIds.map(String), session);

    if (resolvedModels.length > 0)
      await MongoAIModel.bulkWrite(
        resolvedModels.map(({ modelId, model, modelData, isExistingModel }) => ({
          updateOne: {
            filter: isExistingModel
              ? { _id: modelId, scope: ModelScopeEnum.system }
              : { scope: ModelScopeEnum.system, model },
            update: isExistingModel ? getModelConfigUpdate(modelData) : { $set: modelData },
            upsert: !isExistingModel
          }
        })),
        { session }
      );
    return {
      renamedModels: resolvedModels.flatMap((model) => {
        const oldModel = existingModelMap.get(model.modelId)?.model;
        return oldModel && oldModel !== model.model
          ? [{ modelId: model.modelId, oldModel, newModel: model.model }]
          : [];
      }),
      removedModels: existingModels
        .filter(({ _id }) => !retainedModelIds.has(String(_id)))
        .map(({ model }) => model)
    };
  });

  await updatedReloadSystemModel();
  return changes;
};
