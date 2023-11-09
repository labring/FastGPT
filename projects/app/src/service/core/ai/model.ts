import {
  defaultAudioSpeechModels,
  defaultChatModels,
  defaultCQModels,
  defaultExtractModels,
  defaultQAModels,
  defaultQGModels,
  defaultVectorModels
} from '@fastgpt/global/core/ai/model';

export const getChatModel = (model?: string) => {
  return (
    (global.chatModels || defaultChatModels).find((item) => item.model === model) ||
    global.chatModels?.[0] ||
    defaultChatModels[0]
  );
};
export const getQAModel = (model?: string) => {
  return (
    (global.qaModels || defaultQAModels).find((item) => item.model === model) ||
    global.qaModels?.[0] ||
    defaultQAModels[0]
  );
};
export const getCQModel = (model?: string) => {
  return (
    (global.cqModels || defaultCQModels).find((item) => item.model === model) ||
    global.cqModels?.[0] ||
    defaultCQModels[0]
  );
};
export const getExtractModel = (model?: string) => {
  return (
    (global.extractModels || defaultExtractModels).find((item) => item.model === model) ||
    global.extractModels?.[0] ||
    defaultExtractModels[0]
  );
};
export const getQGModel = (model?: string) => {
  return (
    (global.qgModels || defaultQGModels).find((item) => item.model === model) ||
    global.qgModels?.[0] ||
    defaultQGModels[0]
  );
};

export const getVectorModel = (model?: string) => {
  return (
    global.vectorModels.find((item) => item.model === model) ||
    global.vectorModels?.[0] ||
    defaultVectorModels[0]
  );
};

export function getAudioSpeechModel(model?: string) {
  return (
    global.audioSpeechModels.find((item) => item.model === model) ||
    global.audioSpeechModels?.[0] ||
    defaultAudioSpeechModels[0]
  );
}

export enum ModelTypeEnum {
  chat = 'chat',
  qa = 'qa',
  cq = 'cq',
  extract = 'extract',
  qg = 'qg',
  vector = 'vector'
}
export const getModelMap = {
  [ModelTypeEnum.chat]: getChatModel,
  [ModelTypeEnum.qa]: getQAModel,
  [ModelTypeEnum.cq]: getCQModel,
  [ModelTypeEnum.extract]: getExtractModel,
  [ModelTypeEnum.qg]: getQGModel,
  [ModelTypeEnum.vector]: getVectorModel
};
