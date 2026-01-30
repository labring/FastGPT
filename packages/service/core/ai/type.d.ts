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

declare global {
  var ModelProviderRawCache: { provider: string; value: I18nStringStrictType; avatar: string }[];
  var ModelProviderListCache: Record<langType, ModelProviderItemType[]>;
  var ModelProviderMapCache: Record<langType, Record<string, ModelProviderItemType>>;
  var aiproxyIdMapCache: AiproxyMapProviderType;

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
