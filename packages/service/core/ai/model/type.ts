import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  STTModelType,
  RerankModelItemType,
  TTSModelType,
  EmbeddingModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model/type';
import type {
  I18nStringStrictType,
  AiproxyMapProviderItemType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import type { langType, ModelProviderItemType } from '@fastgpt/global/core/ai/provider';

export type SystemModelItemType = (
  | LLMModelItemType
  | EmbeddingModelItemType
  | TTSModelType
  | STTModelType
  | RerankModelItemType
) & {
  createdAt?: Date;
  updatedAt?: Date;
};

export type SystemDefaultModelType = {
  [ModelTypeEnum.llm]?: LLMModelItemType;
  datasetTextLLM?: LLMModelItemType;
  datasetImageLLM?: LLMModelItemType;
  chatTitleLLM?: LLMModelItemType;
  helperBotLLM?: LLMModelItemType;

  [ModelTypeEnum.embedding]?: EmbeddingModelItemType;
  [ModelTypeEnum.tts]?: TTSModelType;
  [ModelTypeEnum.stt]?: STTModelType;
  [ModelTypeEnum.rerank]?: RerankModelItemType;
};

export type DefaultModelConfig = {
  llmId?: string;
  embeddingId?: string;
  ttsId?: string;
  sttId?: string;
  rerankId?: string;
  datasetTextLLMId?: string;
  datasetImageLLMId?: string;
  chatTitleLLMId?: string;
  helperBotLLMId?: string;
};

// Plugin model template — fields needed for frontend query and form autofill
export type ModelTemplateType = Pick<
  SystemModelItemType,
  'provider' | 'model' | 'name' | 'avatar' | 'type'
> & {
  defaultConfig?: Record<string, any>;
  fieldMap?: Record<string, string>;
  maxContext?: number;
  maxResponse?: number;
  vision?: boolean;
  functionCall?: boolean;
  reasoning?: boolean;
  toolChoice?: boolean;
  voices?: { label: string; value: string }[];
};

declare global {
  var ModelProviderRawCache: { provider: string; value: I18nStringStrictType; avatar: string }[];
  var ModelProviderListCache: Record<langType, ModelProviderItemType[]>;
  var ModelProviderMapCache: Record<langType, Record<string, ModelProviderItemType>>;
  // Provider channel TEMPLATES from the model plugin (defaults for the channel
  // create form) — not the runtime channel cache, which lives in
  // service/core/ai/channel/cache.ts (aiproxyChannelBucketCache).
  var aiproxyChannelTemplatesCache: AiproxyMapProviderItemType[];

  // Model caches (key = _id.toString())
  var systemModelList: SystemModelItemType[];
  var systemModelIdMap: Map<string, SystemModelItemType>;
  /** @deprecated Hot-upgrade compatibility. Remove in the contract release. */
  var systemModelNameMap: Map<string, SystemModelItemType>;

  var llmModelIdMap: Map<string, LLMModelItemType>;
  var embeddingModelIdMap: Map<string, EmbeddingModelItemType>;
  var ttsModelIdMap: Map<string, TTSModelType>;
  var sttModelIdMap: Map<string, STTModelType>;
  var reRankModelIdMap: Map<string, RerankModelItemType>;

  /** @deprecated Hot-upgrade compatibility. Remove in the contract release. */
  var llmModelNameMap: Map<string, LLMModelItemType>;
  /** @deprecated Hot-upgrade compatibility. Remove in the contract release. */
  var embeddingModelNameMap: Map<string, EmbeddingModelItemType>;
  /** @deprecated Hot-upgrade compatibility. Remove in the contract release. */
  var ttsModelNameMap: Map<string, TTSModelType>;
  /** @deprecated Hot-upgrade compatibility. Remove in the contract release. */
  var sttModelNameMap: Map<string, STTModelType>;
  /** @deprecated Hot-upgrade compatibility. Remove in the contract release. */
  var reRankModelNameMap: Map<string, RerankModelItemType>;

  var systemActiveModelList: SystemModelItemType[];
  var systemDefaultModel: SystemDefaultModelType;

  // Model template cache (raw model definitions provided by plugins)
  var modelTemplateCache: ModelTemplateType[];
}

export {};
