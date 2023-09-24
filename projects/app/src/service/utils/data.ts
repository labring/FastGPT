export const getChatModel = (model?: string) => {
  return global.chatModels.find((item) => item.model === model);
};
export const getVectorModel = (model?: string) => {
  return (
    global.vectorModels.find((item) => item.model === model) || {
      model: 'UnKnow',
      name: 'UnKnow',
      defaultToken: 500,
      price: 0,
      maxToken: 3000
    }
  );
};

export const getModel = (model?: string) => {
  return [
    ...global.chatModels,
    ...global.vectorModels,
    global.qaModel,
    global.extractModel,
    global.cqModel
  ].find((item) => item.model === model);
};
