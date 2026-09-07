import type { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  EmbeddingSystemModelDataType,
  LLMSystemModelDataType,
  RerankSystemModelDataType,
  STTSystemModelDataType,
  SystemModelDocumentDataType,
  TTSSystemModelDataType
} from '@fastgpt/global/core/ai/model.schema';
import type {
  I18nStringStrictType,
  AiproxyMapProviderItemType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import type { langType, ModelProviderItemType } from '@fastgpt/global/core/ai/provider';

export type SystemModelSchemaType = SystemModelDocumentDataType & {
  _id: string;
};

export type SystemDefaultModelType = {
  [ModelTypeEnum.llm]?: LLMSystemModelDataType;
  datasetTextLLM?: LLMSystemModelDataType;
  datasetImageLLM?: LLMSystemModelDataType;
  chatTitleLLM?: LLMSystemModelDataType;

  [ModelTypeEnum.embedding]?: EmbeddingSystemModelDataType;
  [ModelTypeEnum.tts]?: TTSSystemModelDataType;
  [ModelTypeEnum.stt]?: STTSystemModelDataType;
  [ModelTypeEnum.rerank]?: RerankSystemModelDataType;
};

declare global {
  var ModelProviderRawCache: { provider: string; value: I18nStringStrictType; avatar: string }[];
  var ModelProviderListCache: Record<langType, ModelProviderItemType[]>;
  var ModelProviderMapCache: Record<langType, Record<string, ModelProviderItemType>>;
  var aiproxyChannelsCache: AiproxyMapProviderItemType[];
}

export {};
