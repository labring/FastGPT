import type {
  EmbeddingModelItemType,
  LLMModelItemType,
  RerankModelItemType,
  STTModelType,
  TTSModelType
} from '@fastgpt/global/core/ai/model.schema';
import type { SystemModelItemType } from './type';

export const getDefaultLLMModel = () => global?.systemDefaultModel.llm!;
export const getModelById = (id?: string): SystemModelItemType | undefined => {
  if (!id) return undefined;
  return global.systemModelIdMap?.get(id);
};

export const getLLMModelById = (id?: string): LLMModelItemType => {
  if (!id) return getDefaultLLMModel();
  return global.llmModelIdMap?.get(id)!;
};

export const getDefaultDatasetModel = () => global?.systemDefaultModel.llm!;

export const getDatasetModelById = (id?: string): LLMModelItemType => {
  if (!id) return getDefaultLLMModel();
  return global.llmModelIdMap?.get(id)!;
};

export const getVlmModelList = () => {
  return Array.from(global.llmModelIdMap.values())?.filter((item) => item.vision) || [];
};
export const getDefaultVLMModel = () => global?.systemDefaultModel.datasetImageLLM!;
export const getVlmModelById = (id?: string): LLMModelItemType | undefined => {
  if (!id) return undefined;
  return global.llmModelIdMap?.get(id)!;
};

export const getDefaultHelperBotModel = (): LLMModelItemType =>
  global?.systemDefaultModel.helperBotLLM || getDefaultLLMModel();

export const getDefaultEmbeddingModel = () => global?.systemDefaultModel.embedding!;
export const getEmbeddingModelById = (id?: string): EmbeddingModelItemType => {
  if (!id) return getDefaultEmbeddingModel();
  return global.embeddingModelIdMap?.get(id)!;
};

export const getDefaultTTSModel = () => global?.systemDefaultModel.tts!;
export function getTTSModelById(id?: string): TTSModelType {
  if (!id) return getDefaultTTSModel();
  return global.ttsModelIdMap?.get(id)!;
}

export const getDefaultSTTModel = () => global?.systemDefaultModel.stt!;
export function getSTTModelById(id?: string): STTModelType {
  if (!id) return getDefaultSTTModel();
  return global.sttModelIdMap?.get(id)!;
}

export const getDefaultRerankModel = () => global?.systemDefaultModel.rerank!;
export function getRerankModelById(id?: string): RerankModelItemType {
  if (!id) return getDefaultRerankModel();
  return global.reRankModelIdMap?.get(id)!;
}

export const getDefaultEvaluationModel = () => global?.systemDefaultModel.evaluation;
export function getEvaluationModelById(id?: string) {
  if (!id) return getDefaultEvaluationModel();
  return global.llmModelIdMap?.get(id)!;
}
