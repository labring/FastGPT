import type { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type {
  STTModelType,
  RerankModelItemType,
  TTSModelType,
  EmbeddingModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.d';
import type { ModelProviderListType } from '@fastgpt/global/core/app/model/type';
import type {
  AiproxyMapProviderType,
  I18nStringStrictType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import type { langType, ModelProviderItemType } from '@fastgpt/global/core/ai/provider';

export type SystemModelSchemaType = {
  _id: string;
  model: string;
  metadata: SystemModelItemType;
};

export type SystemModelItemType =
  | LLMModelItemType
  | EmbeddingModelItemType
  | TTSModelType
  | STTModelType
  | RerankModelItemType;

export type SystemDefaultModelType = {
  [ModelTypeEnum.llm]?: LLMModelItemType;
  datasetTextLLM?: LLMModelItemType;
  datasetImageLLM?: LLMModelItemType;

  [ModelTypeEnum.embedding]?: EmbeddingModelItemType;
  [ModelTypeEnum.tts]?: TTSModelType;
  [ModelTypeEnum.stt]?: STTModelType;
  [ModelTypeEnum.rerank]?: RerankModelItemType;
};

import type { I18nStringType } from '@fastgpt/global/common/i18n/type';

export type PluginDatasetSourceType = {
  sourceId: string;
  name: I18nStringType;
  description?: I18nStringType;
  icon: string;
  iconOutline?: string;
  version?: string;
  courseUrl?: string;
  formFields?: Array<{
    key: string;
    label: I18nStringType;
    type: 'input' | 'password' | 'select' | 'tree-select';
    required?: boolean;
  }>;
};

declare global {
  var ModelProviderRawCache: { provider: string; value: I18nStringStrictType; avatar: string }[];
  var ModelProviderListCache: Record<langType, ModelProviderItemType[]>;
  var ModelProviderMapCache: Record<langType, Record<string, ModelProviderItemType>>;
  var aiproxyIdMapCache: AiproxyMapProviderType;

  // Plugin dataset sources cache
  var PluginDatasetSourcesCache: PluginDatasetSourceType[];

  var systemModelList: SystemModelItemType[];
  // var systemModelMap: Map<string, SystemModelItemType>;
  var llmModelMap: Map<string, LLMModelItemType>;
  var embeddingModelMap: Map<string, EmbeddingModelItemType>;
  var ttsModelMap: Map<string, TTSModelType>;
  var sttModelMap: Map<string, STTModelType>;
  var reRankModelMap: Map<string, RerankModelItemType>;

  var systemActiveModelList: SystemModelItemType[];
  var systemActiveDesensitizedModels: SystemModelItemType[];
  var systemDefaultModel: SystemDefaultModelType;
}
