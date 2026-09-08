import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDocumentDataType } from '@fastgpt/global/core/ai/model.schema';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { findSystemDefaultModelIds } from '@fastgpt/service/core/ai/defaultModel/entity';
import type { ModelRequirement } from './types';

type StoredModel = SystemModelDocumentDataType & { _id: unknown };

export type ModelCatalog = Awaited<ReturnType<typeof loadModelCatalog>>;

/**
 * 为单个迁移任务加载一份独立的系统模型快照。
 * 普通资源只接受有效 modelId 或名称、类型完全匹配的旧模型；App 功能开启但引用为空时，
 * 还可以显式调用默认回退：优先系统默认，其次按 _id 稳定选择首个兼容模型。
 * 空目录是新安装的合法状态；仅在实际解析引用或默认模型时要求目录可用，
 * 由增量迁移记录逐条失败，避免空集合误报失败或历史引用被跳过后无法重试。
 */
export const loadModelCatalog = async () => {
  const [models, defaultModelIds] = await Promise.all([
    MongoAIModel.find({ scope: ModelScopeEnum.system }).sort({ _id: 1 }).lean() as Promise<
      StoredModel[]
    >,
    findSystemDefaultModelIds()
  ]);
  /** 仅保护需要模型目录的操作，空集合和无引用资源仍可按正常流程完成迁移。 */
  const assertAvailable = () => {
    if (models.length === 0) {
      throw new Error('Cannot migrate model references while ai_models is empty');
    }
  };
  const hasReference = (value: unknown) => value !== undefined && value !== null && value !== '';

  const modelByName = new Map(models.map((model) => [model.model, model]));
  const modelById = new Map(models.map((model) => [String(model._id), model]));

  const matchesRequirement = (model: StoredModel, requirement: ModelRequirement) =>
    model.type === requirement.type &&
    (!requirement.vision || ('vision' in model.config && model.config.vision === true));

  return {
    /**
     * 知识库理解模型依次检查有效 ID、精确旧名称；图片理解要求视觉能力。
     * 文本理解未配置旧名称也补默认，图片理解旧名称为空则不补默认，但仍优先保留有效 ID。
     * 已配置默认模型不检查启用状态；仅未配置默认时按 _id 升序选择首个启用的兼容模型。
     * 原模型仅停用时保留原选择；无法解析配置的默认模型或没有兼容候选时不生成 ID。
     */
    resolveDatasetUnderstandingModelId: ({
      legacyModel,
      modelId,
      vision
    }: {
      legacyModel: unknown;
      modelId: unknown;
      vision: boolean;
    }): string | undefined => {
      const requirement = { type: ModelTypeEnum.llm, vision };
      const current = modelById.get(String(modelId ?? ''));
      if (current && matchesRequirement(current, requirement)) return String(current._id);
      // 图片模型未配置时不新增图片理解配置；文本模型即使未配置也需要默认回填。
      if (vision && isEmptyModelValue(legacyModel)) return;
      const named = typeof legacyModel === 'string' ? modelByName.get(legacyModel) : undefined;
      if (named && matchesRequirement(named, requirement)) return String(named._id);
      const defaultId = defaultModelIds[vision ? 'datasetImageLLM' : 'datasetTextLLM'];
      if (!isEmptyModelValue(defaultId)) {
        const defaultModel = modelById.get(String(defaultId));
        return defaultModel && matchesRequirement(defaultModel, requirement)
          ? String(defaultModel._id)
          : undefined;
      }
      const fallback = models.find(
        (model) => model.isActive && matchesRequirement(model, requirement)
      );
      return fallback ? String(fallback._id) : undefined;
    },
    // 权限清理必须先证明目录可用，不能把空目录中的全部 ACL 判断为悬空权限。
    assertAvailable,
    resolveModelIdByName: (modelName: string | undefined): string | undefined => {
      if (!modelName) return;
      assertAvailable();
      const model = modelByName.get(modelName);
      return model ? String(model._id) : undefined;
    },
    hasMatchingModelId: (modelId: unknown, requirement: ModelRequirement) => {
      if (!hasReference(modelId)) return false;
      assertAvailable();
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
      if (!legacyModel && !hasReference(modelId)) return;
      assertAvailable();
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
      assertAvailable();
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
    hasModelId: (modelId: unknown) => {
      if (!hasReference(modelId)) return false;
      assertAvailable();
      return modelById.has(String(modelId));
    }
  };
};
