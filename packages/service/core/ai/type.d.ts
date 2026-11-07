import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingModelDataType,
  LLMModelDataType,
  RerankModelDataType,
  STTModelDataType,
  AIModelDocumentDataType,
  TTSModelDataType
} from '@fastgpt/global/core/ai/model/schema';
import type {
  I18nStringStrictType,
  AiproxyMapProviderItemType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import type { langType, ModelProviderItemType } from '@fastgpt/global/core/ai/model/provider';

export type AIModelSchemaType = AIModelDocumentDataType & {
  _id: string;
};

export type SystemDefaultModelType = {
  [ModelTypeEnum.llm]?: LLMModelDataType;
  datasetTextLLM?: LLMModelDataType;
  datasetImageLLM?: LLMModelDataType;
  chatTitleLLM?: LLMModelDataType;

  [ModelTypeEnum.embedding]?: EmbeddingModelDataType;
  [ModelTypeEnum.tts]?: TTSModelDataType;
  [ModelTypeEnum.stt]?: STTModelDataType;
  [ModelTypeEnum.rerank]?: RerankModelDataType;
};

declare global {
  var ModelProviderRawCache: { provider: string; value: I18nStringStrictType; avatar: string }[];
  var ModelProviderListCache: Record<langType, ModelProviderItemType[]>;
  var ModelProviderMapCache: Record<langType, Record<string, ModelProviderItemType>>;
  var aiproxyChannelsCache: AiproxyMapProviderItemType[];
}

export {};
