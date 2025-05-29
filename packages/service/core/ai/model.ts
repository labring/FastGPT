import { cloneDeep } from 'lodash';
import { type SystemModelItemType } from './type';

export const getDefaultLLMModel = () => global?.systemDefaultModel.llm!;
export const getLLMModel = (model?: string) => {
  if (!model) return getDefaultLLMModel();
  return global.llmModelMap.get(model) || getDefaultLLMModel();
};

export const getDatasetModel = (model?: string) => {
  return (
    Array.from(global.llmModelMap.values())
      ?.filter((item) => item.datasetProcess)
      ?.find((item) => item.model === model || item.name === model) ?? getDefaultLLMModel()
  );
};
export const getVlmModel = (model?: string) => {
  return Array.from(global.llmModelMap.values())
    ?.filter((item) => item.vision)
    ?.find((item) => item.model === model || item.name === model);
};

export const getVlmModelList = () => {
  return Array.from(global.llmModelMap.values())?.filter((item) => item.vision) || [];
};

export const getDefaultEmbeddingModel = () => global?.systemDefaultModel.embedding!;
export const getEmbeddingModel = (model?: string) => {
  if (!model) return getDefaultEmbeddingModel();
  return global.embeddingModelMap.get(model) || getDefaultEmbeddingModel();
};

export const getDefaultTTSModel = () => global?.systemDefaultModel.tts!;
export function getTTSModel(model?: string) {
  if (!model) return getDefaultTTSModel();
  return global.ttsModelMap.get(model) || getDefaultTTSModel();
}

export const getDefaultSTTModel = () => global?.systemDefaultModel.stt!;
export function getSTTModel(model?: string) {
  if (!model) return getDefaultSTTModel();
  return global.sttModelMap.get(model) || getDefaultSTTModel();
}

export const getDefaultRerankModel = () => global?.systemDefaultModel.rerank!;
export function getRerankModel(model?: string) {
  if (!model) return getDefaultRerankModel();
  return global.reRankModelMap.get(model) || getDefaultRerankModel();
}

export const findAIModel = (model: string): SystemModelItemType | undefined => {
  return (
    global.llmModelMap.get(model) ||
    global.embeddingModelMap.get(model) ||
    global.ttsModelMap.get(model) ||
    global.sttModelMap.get(model) ||
    global.reRankModelMap.get(model)
  );
};
export const findModelFromAlldata = (model: string) => {
  return cloneDeep(global.systemModelList.find((item) => item.model === model));
};
