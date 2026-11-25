import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { defaultProvider } from '@fastgpt/global/core/ai/model/provider';
import {
  AIModelDocumentDataSchema,
  type AIModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
import type {
  ImportPreviewBlankModelData,
  ImportPreviewCandidate,
  PreviewImportFromChannelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

type ChannelImportRow = PreviewImportFromChannelResponse['items'][number];
/** 按当前选择的模型类型筛选，并按上游 ID、候选名称或模型 ID 搜索预览行。 */
export const filterChannelImportPreviewItems = ({
  items,
  modelType,
  search,
  getModelType
}: {
  items: ReadonlyArray<ChannelImportRow>;
  modelType: ModelTypeEnum | '';
  search: string;
  getModelType: (row: ChannelImportRow) => ModelTypeEnum | undefined;
}) => {
  const query = search.trim().toLowerCase();
  const includesQuery = (value?: string) => value?.toLowerCase().includes(query) ?? false;

  return items.filter((row) => {
    if (modelType && getModelType(row) !== modelType) return false;
    if (!query) return true;

    const { modelData } = row.candidate;
    return (
      includesQuery(row.providerModelSlug) ||
      includesQuery(modelData?.name) ||
      includesQuery(modelData?.model)
    );
  });
};

/** 空白草稿仅取上游推断信息，模板的配置只用于所选模板。 */
export const getBlankChannelImportDraft = (candidate: ImportPreviewCandidate) =>
  candidate.category === 'blank' ? candidate.modelData : candidate.blankModelData;

/**
 * 根据上游推断字段和空白模型默认值构造模型草稿。
 * 上游响应上限存在时优先用于 LLM `maxResponse`；缺省时保留现有默认值。
 */
export const buildBlankChannelModelData = ({
  providerModelSlug,
  modelType,
  modelData,
  contextLength,
  maxCompletionTokens,
  createModelData
}: {
  providerModelSlug: string;
  modelType?: ModelTypeEnum;
  modelData?: ImportPreviewBlankModelData;
  contextLength?: number;
  maxCompletionTokens?: number;
  createModelData: (type: ModelTypeEnum) => AIModelDocumentDataType;
}): AIModelDocumentDataType | undefined => {
  const type = modelType ?? modelData?.type;
  const selectedProvider = modelData?.provider?.trim() || defaultProvider.id;
  if (!type) return;

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const base = createModelData(type);
  const baseConfig: Record<string, unknown> = isRecord(base.config) ? base.config : {};
  const configSource: Record<string, unknown> = {
    ...(isRecord(modelData?.config) ? modelData.config : {})
  };
  const contextLimit =
    typeof contextLength === 'number' && Number.isFinite(contextLength) ? contextLength : undefined;
  const getBaseLimit = (key: string) => {
    const value = baseConfig[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  const getLimit = (key: string, fallback = getBaseLimit(key)) => {
    const value = configSource[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };
  const maxContext = contextLimit ?? getLimit('maxContext');
  const config = {
    ...base.config,
    ...configSource,
    ...(type === ModelTypeEnum.llm
      ? {
          maxContext,
          maxResponse: maxCompletionTokens ?? getLimit('maxResponse'),
          // 空白模型表单用 NaN 表示未填；导入时按保存逻辑回退到上下文的 80%。
          quoteMaxToken: getLimit('quoteMaxToken', Math.floor(maxContext * 0.8))
        }
      : {}),
    ...(type === ModelTypeEnum.embedding || type === ModelTypeEnum.rerank
      ? { maxToken: contextLimit ?? getLimit('maxToken') }
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
