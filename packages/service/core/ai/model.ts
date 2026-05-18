import { type SystemModelItemType } from './type';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';

export const getDefaultLLMModel = () => global?.systemDefaultModel.llm!;
export const getModelById = (id?: string) => {
  if (!id) return undefined;
  return global.systemModelIdMap?.get(id);
};

export const getLLMModelById = (id?: string | LLMModelItemType): LLMModelItemType => {
  if (!id) return getDefaultLLMModel();
  return typeof id === 'string' ? global.llmModelIdMap?.get(id) || getDefaultLLMModel() : id;
};

export const getDefaultDatasetModel = () => global?.systemDefaultModel.llm!;

export const getDatasetModelById = (id?: string): LLMModelItemType => {
  if (!id) return getDefaultLLMModel();
  return global.llmModelIdMap?.get(id) || getDefaultLLMModel();
};

export const getVlmModelList = () => {
  return Array.from(global.llmModelIdMap.values())?.filter((item) => item.vision) || [];
};
export const getDefaultVLMModel = () => global?.systemDefaultModel.datasetImageLLM!;
export const getVlmModelById = (id?: string): LLMModelItemType => {
  if (!id) return undefined;
  return global.llmModelIdMap?.get(id)!;
};

export const getDefaultHelperBotModel = (): LLMModelItemType =>
  global?.systemDefaultModel.helperBotLLM || getDefaultLLMModel();

export const getDefaultEmbeddingModel = () => global?.systemDefaultModel.embedding!;
export const getEmbeddingModelById = (id?: string) => {
  if (!id) return getDefaultEmbeddingModel();
  return global.embeddingModelIdMap?.get(id) || getDefaultEmbeddingModel();
};

export const getDefaultTTSModel = () => global?.systemDefaultModel.tts!;
export function getTTSModelById(id?: string) {
  if (!id) return getDefaultTTSModel();
  return global.ttsModelIdMap?.get(id) || getDefaultTTSModel();
}

export const getDefaultSTTModel = () => global?.systemDefaultModel.stt!;
export function getSTTModelById(id?: string) {
  if (!id) return getDefaultSTTModel();
  return global.sttModelIdMap?.get(id) || getDefaultSTTModel();
}

export const getDefaultRerankModel = () => global?.systemDefaultModel.rerank!;
export function getRerankModelById(id?: string) {
  if (!id) return getDefaultRerankModel();
  return global.reRankModelIdMap?.get(id) || getDefaultRerankModel();
}

export const getDefaultEvaluationModel = () => global?.systemDefaultModel.evaluation;
export function getEvaluationModelById(id?: string) {
  if (!id) return getDefaultEvaluationModel();
  return global.llmModelIdMap?.get(id) || getDefaultEvaluationModel();
}
