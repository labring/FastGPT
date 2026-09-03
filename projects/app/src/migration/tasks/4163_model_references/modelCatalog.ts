import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { findSystemDefaultModelIds } from '@fastgpt/service/core/ai/defaultModel/entity';
import type { ModelRequirement } from './types';

type StoredModel = SystemModelDocumentDataType & { _id: unknown };

export type ModelCatalog = Awaited<ReturnType<typeof loadModelCatalog>>;

/**
 * 为单个迁移任务加载一份独立的系统模型快照。
 * 普通资源只接受有效 modelId 或名称、类型完全匹配的旧模型；App 功能开启但引用为空时，
 * 还可以显式调用默认回退：优先系统默认，其次按 _id 稳定选择首个兼容模型。
 */
export const loadModelCatalog = async () => {
  const [models, defaultModelIds] = await Promise.all([
    MongoAIModel.find({ scope: ModelScopeEnum.system }).sort({ _id: 1 }).lean() as Promise<
      StoredModel[]
    >,
    findSystemDefaultModelIds()
  ]);
  if (models.length === 0) {
    throw new Error('ai_models is empty; wait for model bootstrap before running 4163 migrations');
  }

  const modelByName = new Map(models.map((model) => [model.model, model]));
  const modelById = new Map(models.map((model) => [String(model._id), model]));

  const matchesRequirement = (model: StoredModel, requirement: ModelRequirement) =>
    model.type === requirement.type &&
    (!requirement.vision || ('vision' in model.config && model.config.vision === true));

  return {
    resolveModelIdByName: (modelName: string | undefined): string | undefined => {
      const model = modelName ? modelByName.get(modelName) : undefined;
      return model ? String(model._id) : undefined;
    },
    hasMatchingModelId: (modelId: unknown, requirement: ModelRequirement) => {
      const model = modelById.get(String(modelId));
      return !!model && matchesRequirement(model, requirement);
    },
    resolveModelId: ({
      legacyModel,
      modelId,
      requirement
    }: {
      legacyModel?: string;
      modelId?: unknown;
      requirement: ModelRequirement;
    }): string | undefined => {
      const currentModel = modelId === undefined ? undefined : modelById.get(String(modelId));
      if (currentModel && matchesRequirement(currentModel, requirement)) {
        return String(currentModel._id);
      }

      const namedModel = legacyModel ? modelByName.get(legacyModel) : undefined;
      if (namedModel && matchesRequirement(namedModel, requirement)) {
        return String(namedModel._id);
      }
    },
    /** App 功能开启但没有可解析引用时，优先使用系统默认，其次确定性选择首个兼容模型。 */
    resolveFallbackModelId: (requirement: ModelRequirement): string | undefined => {
      const configuredDefaultId = defaultModelIds[requirement.type];
      const configuredDefault = configuredDefaultId
        ? modelById.get(configuredDefaultId)
        : undefined;
      if (configuredDefault && matchesRequirement(configuredDefault, requirement)) {
        return String(configuredDefault._id);
      }

      const firstMatchingModel = models.find((model) => matchesRequirement(model, requirement));
      return firstMatchingModel ? String(firstMatchingModel._id) : undefined;
    },
    hasModelId: (modelId: unknown) => modelById.has(String(modelId))
  };
};
