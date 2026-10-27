import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import {
  AIModelDocumentDataSchema,
  type AIModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
import { mergeChannelTemplateModelData } from '@fastgpt/global/core/ai/model/utils';
import type {
  ApplyChangesBody,
  ImportPreviewItem,
  ModelConfigListItem,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

type ChannelImportRow = PreviewImportFromChannelResponse['items'][number];
type ChannelImportItem = ImportPreviewItem;
type BlankModelData =
  | NonNullable<Extract<ChannelImportItem, { category: 'blank' }>['modelData']>
  | NonNullable<Extract<ChannelImportItem, { category: 'template' }>['blankModelData']>
  | AIModelDocumentDataType;
type BlankPreviewItem = Extract<ChannelImportItem, { category: 'blank' | 'template' }>;

/** 始终使用后端按优先级排序后的首个候选。 */
export const getChannelImportCandidate = (item: ChannelImportRow) => {
  const candidate = item.candidates[0];
  if (!candidate) throw new Error('Channel import preview item must include a candidate');
  return candidate;
};

/** 按默认候选的模型类型筛选，并按上游 ID、本地名称或模型 ID 搜索预览行。 */
export const filterChannelImportPreviewItems = ({
  items,
  modelType,
  search,
  installedModels
}: {
  items: ReadonlyArray<ChannelImportRow>;
  modelType: ModelTypeEnum | '';
  search: string;
  installedModels: ReadonlyArray<Pick<ModelConfigListItem, 'modelId' | 'model' | 'name' | 'type'>>;
}) => {
  const installedModelsById = new Map(
    installedModels.map((model) => [model.modelId, model] as const)
  );
  const query = search.trim().toLowerCase();
  const includesQuery = (value?: string) => value?.toLowerCase().includes(query) ?? false;

  return items.filter((row) => {
    const candidate = getChannelImportCandidate(row);
    const candidateType = (() => {
      if (candidate.category === 'template') return candidate.template.type;
      if (candidate.category === 'blank') {
        return candidate.modelType ?? candidate.modelData?.type;
      }
      return installedModelsById.get(candidate.modelId)?.type;
    })();
    const modelData =
      candidate.category === 'template' || candidate.category === 'blank'
        ? candidate.modelData
        : installedModelsById.get(candidate.modelId);
    const matchesType = !modelType || candidateType === modelType;
    const matchesSearch =
      !query ||
      includesQuery(row.providerModelSlug) ||
      includesQuery(modelData?.name) ||
      includesQuery(modelData?.model);

    return matchesType && matchesSearch;
  });
};

/** Resolve only upstream-derived values; a template's merged draft is never a blank fallback. */
export const getBlankChannelImportDraft = (item: BlankPreviewItem) => {
  const modelData = item.category === 'blank' ? item.modelData : item.blankModelData;

  return {
    modelData,
    modelType: (item.category === 'blank' ? item.modelType : undefined) ?? modelData?.type,
    provider: modelData?.provider,
    contextLength: item.contextLength
  };
};

/**
 * Build a complete system-model payload from inferred fields and the existing blank-model defaults.
 * Known context length fills the selected type's limit; a missing response cap keeps the base default.
 */
export const buildBlankChannelModelData = ({
  providerModelSlug,
  modelType,
  provider,
  modelData,
  contextLength,
  createModelData
}: {
  providerModelSlug: string;
  modelType?: ModelTypeEnum;
  provider?: string;
  modelData?: BlankModelData;
  contextLength?: number;
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
}): AIModelDocumentDataType | undefined => {
  const type = modelType ?? modelData?.type;
  const selectedProvider = provider?.trim() || modelData?.provider?.trim() || defaultProvider.id;
  if (!type) return;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const base = createModelData(type);
  const baseConfig: Record<string, unknown> = isRecord(base.config) ? base.config : {};
  const configSource: Record<string, unknown> = {
    ...(isRecord(modelData?.config) ? modelData.config : {})
  };
  const contextLimit = Number.isFinite(contextLength) ? (contextLength ?? 0) : 0;
  const getLimit = (key: string, fallback = 0) => {
    const value = configSource[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const maxContext = getLimit('maxContext', contextLimit);
  const baseMaxResponse = baseConfig.maxResponse;
  const maxResponseFallback =
    typeof baseMaxResponse === 'number' && Number.isFinite(baseMaxResponse) ? baseMaxResponse : 0;
  const config = {
    ...base.config,
    ...configSource,
    ...(type === ModelTypeEnum.llm
      ? {
          maxContext,
          maxResponse: getLimit('maxResponse', maxResponseFallback),
          // 空白模型表单用 NaN 表示未填；导入时按保存逻辑回退到上下文的 80%。
          quoteMaxToken: getLimit('quoteMaxToken', Math.floor(maxContext * 0.8))
        }
      : {}),
    ...(type === ModelTypeEnum.embedding || type === ModelTypeEnum.rerank
      ? { maxToken: getLimit('maxToken', contextLimit) }
      : {})
  };

  return AIModelDocumentDataSchema.parse({
    ...base,
    ...modelData,
    type,
    scope: base.scope,
    provider: selectedProvider,
    model: providerModelSlug,
    name: modelData?.name ?? providerModelSlug,
    config
  });
};

/** Translate one selected preview row into the batch API operation it owns. */
export const buildChannelImportOperation = ({
  providerModelSlug,
  item,
  modelData,
  templateData,
  contextLength,
  maxCompletionTokens,
  isActive = true
}: {
  providerModelSlug: string;
  item: ChannelImportItem;
  modelData?: AIModelDocumentDataType;
  templateData?: AIModelDocumentDataType;
  contextLength?: number;
  maxCompletionTokens?: number;
  isActive?: boolean;
}): ApplyChangesBody['operations'][number] | undefined => {
  if (templateData) {
    return {
      action: 'create',
      providerModelSlug,
      modelData: {
        ...mergeChannelTemplateModelData({
          template: templateData,
          contextLength,
          maxCompletionTokens
        }),
        model: providerModelSlug
      },
      isActive
    };
  }
  if (item.category === 'existing' || item.category === 'associated') {
    return {
      action: 'associate',
      providerModelSlug,
      modelId: item.modelId,
      isActive
    };
  }
  if (item.category === 'blank' && modelData) {
    return {
      action: 'create',
      providerModelSlug,
      modelData,
      isActive
    };
  }
  return;
};
