import type { LLMModelItemType, VectorModelItemType } from './model.d';
import { getModelProvider, ModelProviderIdType } from './provider';

export const defaultQAModels: LLMModelItemType[] = [
  {
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    name: 'gpt-4o-mini',
    maxContext: 16000,
    maxResponse: 16000,
    quoteMaxToken: 13000,
    maxTemperature: 1.2,
    charsPointsPrice: 0,
    censor: false,
    vision: false,
    datasetProcess: true,
    toolChoice: true,
    functionCall: false,
    customCQPrompt: '',
    customExtractPrompt: '',
    defaultSystemChatPrompt: '',
    defaultConfig: {}
  }
];

export const defaultVectorModels: VectorModelItemType[] = [
  {
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding-2',
    charsPointsPrice: 0,
    defaultToken: 500,
    maxToken: 3000,
    weight: 100
  }
];

export const getModelFromList = (
  modelList: { provider: ModelProviderIdType; name: string; model: string }[],
  model: string
) => {
  const modelData = modelList.find((item) => item.model === model) ?? modelList[0];
  const provider = getModelProvider(modelData.provider);
  return {
    ...modelData,
    avatar: provider.avatar
  };
};
