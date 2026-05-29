import lodash from 'lodash';
import { type SystemModelItemType } from './type';
import type {
  EmbeddingModelItemType,
  LLMModelItemType
} from '@fastgpt/global/core/ai/model.schema';

const { cloneDeep } = lodash;

export const getDefaultLLMModel = () => global.systemDefaultModel.llm!;
export const getLLMModel = (model?: string | LLMModelItemType) => {
  if (!model) return getDefaultLLMModel();

  return typeof model === 'string' ? global.llmModelMap.get(model) || getDefaultLLMModel() : model;
};

export const getDatasetModel = (model?: string) => {
  return (
    Array.from(global.llmModelMap.values())?.find(
      (item) => item.model === model || item.name === model
    ) ?? getDefaultLLMModel()
  );
};

export const getVlmModelList = () => {
  return Array.from(global.llmModelMap.values())?.filter((item) => item.vision) || [];
};
export const getDefaultVLMModel = () => global?.systemDefaultModel.datasetImageLLM;
export const getVlmModel = (model?: string) => {
  const list = getVlmModelList();
  return list.find((item) => item.model === model || item.name === model) || list[0];
};

export const getDefaultHelperBotModel = (): LLMModelItemType =>
  global?.systemDefaultModel.helperBotLLM || getDefaultLLMModel();

export const getDefaultEmbeddingModel = () => global?.systemDefaultModel.embedding!;
export const getEmbeddingModel = (model?: string | EmbeddingModelItemType) => {
  if (!model) return getDefaultEmbeddingModel();
  if (typeof model === 'string') {
    return global.embeddingModelMap.get(model) || getDefaultEmbeddingModel();
  }

  return model;
};
export const isImageEmbeddingModel = (model?: string | EmbeddingModelItemType) => {
  return !!getEmbeddingModel(model)?.vision;
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

export const findAIModel = (
  model: string | SystemModelItemType
): SystemModelItemType | undefined => {
  if (typeof model === 'object') {
    return model;
  }

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
