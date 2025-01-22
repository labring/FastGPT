import { SystemModelItemType } from './type';

export const getFirstLLMModel = () => {
  return Array.from(global.llmModelMap.values())[0];
};
export const getLLMModel = (model?: string) => {
  if (!model) return getFirstLLMModel();
  return global.llmModelMap.get(model) || getFirstLLMModel();
};

export const getDatasetModel = (model?: string) => {
  return (
    Array.from(global.llmModelMap.values())
      ?.filter((item) => item.datasetProcess)
      ?.find((item) => item.model === model || item.name === model) ?? getFirstLLMModel()
  );
};

export const getFirstEmbeddingModel = () => Array.from(global.embeddingModelMap.values())[0];
export const getEmbeddingModel = (model?: string) => {
  if (!model) return getFirstEmbeddingModel();
  return global.embeddingModelMap.get(model) || getFirstEmbeddingModel();
};

export const getFirstTTSModel = () => Array.from(global.ttsModelMap.values())[0];
export function getTTSModel(model?: string) {
  if (!model) return getFirstTTSModel();
  return global.ttsModelMap.get(model) || getFirstTTSModel();
}

export const getFirstSTTModel = () => Array.from(global.sttModelMap.values())[0];
export function getSTTModel(model?: string) {
  if (!model) return getFirstSTTModel();
  return global.sttModelMap.get(model) || getFirstSTTModel();
}

export const getFirstReRankModel = () => Array.from(global.reRankModelMap.values())[0];
export function getReRankModel(model?: string) {
  if (!model) return getFirstReRankModel();
  return global.reRankModelMap.get(model) || getFirstReRankModel();
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
  return global.systemModelList.find((item) => item.model === model);
};
