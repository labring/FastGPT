import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';

export const getLLMModel = (model?: string) => {
  return (
    global.llmModels.find((item) => item.model === model || item.name === model) ??
    global.llmModels[0]
  );
};

export const getDatasetModel = (model?: string) => {
  return (
    global.llmModels
      ?.filter((item) => item.datasetProcess)
      ?.find((item) => item.model === model || item.name === model) ?? global.llmModels[0]
  );
};

export const getVectorModel = (model?: string) => {
  return (
    global.vectorModels.find((item) => item.model === model || item.name === model) ||
    global.vectorModels[0]
  );
};

export function getAudioSpeechModel(model?: string) {
  return (
    global.audioSpeechModels.find((item) => item.model === model || item.name === model) ||
    global.audioSpeechModels[0]
  );
}

export function getWhisperModel(model?: string) {
  return global.whisperModel;
}

export function getReRankModel(model?: string) {
  return global.reRankModels.find((item) => item.model === model);
}

export const getModelMap = {
  [ModelTypeEnum.llm]: getLLMModel,
  [ModelTypeEnum.embedding]: getVectorModel,
  [ModelTypeEnum.tts]: getAudioSpeechModel,
  [ModelTypeEnum.stt]: getWhisperModel,
  [ModelTypeEnum.rerank]: getReRankModel
};

export const findAIModel = (model: string) => {
  return [
    ...global.llmModels,
    ...global.vectorModels,
    ...global.audioSpeechModels,
    global.whisperModel,
    ...global.reRankModels
  ].find((item) => item.model === model || item.name === model);
};
