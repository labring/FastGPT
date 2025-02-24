import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import {
  STTModelType,
  ReRankModelItemType,
  TTSModelType,
  EmbeddingModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.d';

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
  | ReRankModelItemType;

export type SystemDefaultModelType = {
  [ModelTypeEnum.llm]?: LLMModelItemType;
  datasetTextLLM?: LLMModelItemType;
  datasetImageLLM?: LLMModelItemType;

  [ModelTypeEnum.embedding]?: EmbeddingModelItemType;
  [ModelTypeEnum.tts]?: TTSModelType;
  [ModelTypeEnum.stt]?: STTModelType;
  [ModelTypeEnum.rerank]?: ReRankModelItemType;
};

declare global {
  var systemModelList: SystemModelItemType[];
  // var systemModelMap: Map<string, SystemModelItemType>;
  var llmModelMap: Map<string, LLMModelItemType>;
  var embeddingModelMap: Map<string, EmbeddingModelItemType>;
  var ttsModelMap: Map<string, TTSModelType>;
  var sttModelMap: Map<string, STTModelType>;
  var reRankModelMap: Map<string, ReRankModelItemType>;

  var systemActiveModelList: SystemModelItemType[];
  var systemDefaultModel: SystemDefaultModelType;
}
