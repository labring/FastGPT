export const getChatModel = (model?: string) => {
  return global.chatModels.find((item) => item.model === model);
};
export const getVectorModel = (model?: string) => {
  return global.vectorModels.find((item) => item.model === model);
};

export const getModel = (model?: string) => {
  return [...global.chatModels, ...global.vectorModels].find((item) => item.model === model);
};
