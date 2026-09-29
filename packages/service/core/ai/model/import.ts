import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import {
  normalizeModelPricingForRead,
  normalizeModelPricingForSave
} from '@fastgpt/global/core/ai/model/pricing';
import {
  ImportedSystemModelSchema,
  type ParsedSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/core/ai/model/api';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../../../support/permission/schema';
import { runSystemModelTransaction } from './entity';
import { MongoAIModel } from './schema';
import { updatedReloadSystemModel } from './catalog';
import { MongoModelStatusProbeRecord } from '../modelStatus/schema';
import { getSystemModelConfigUpdate } from './utils';

/**
 * 用导入配置替换系统模型集合，保留可匹配实例的稳定 ID，并在同一事务内清理派生权限与探测记录。
 */
export const importSystemModels = async ({
  config
}: ParsedSystemModelsWithJsonBody): Promise<void> => {
  const latestRecords = config.flatMap((record) => {
    const modelId = record.modelId;
    return typeof modelId === 'string' && modelId.trim().length > 0
      ? [{ record, modelId: modelId.trim() }]
      : [];
  });
  if (config.length > 0 && latestRecords.length === 0) return;

  const assertNoDuplicateIds = (models: Array<{ modelId: string }>) => {
    const modelIds = new Set<string>();
    for (const model of models) {
      if (modelIds.has(model.modelId)) throw new UserError(`Duplicate modelId: ${model.modelId}`);
      modelIds.add(model.modelId);
    }
  };
  assertNoDuplicateIds(latestRecords);

  await runSystemModelTransaction(async (session) => {
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

    const importedModels = latestRecords.map(({ record, modelId }, index) => {
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

      const parsed = ImportedSystemModelSchema.safeParse(
        existingModel
          ? {
              ...record,
              modelId,
              model:
                existingByModelId &&
                typeof record.model === 'string' &&
                record.model.trim().length > 0
                  ? record.model.trim()
                  : existingModel.model,
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

        const targetModel = modelData.model || existingModel.model;
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
    if (removedModelIds.length > 0) {
      await MongoAIModel.deleteMany(
        { _id: { $in: removedModelIds }, scope: ModelScopeEnum.system },
        { session }
      );
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.model,
          resourceId: { $in: removedModelIds }
        },
        { session }
      );
      await MongoModelStatusProbeRecord.deleteMany(
        { modelId: { $in: removedModelIds.map(String) } },
        { session }
      );
    }

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
};
