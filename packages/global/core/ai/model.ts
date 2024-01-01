import type { LLMModelItemType, VectorModelItemType } from './model.d';

export const defaultQAModels: LLMModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxContext: 16000,
    maxResponse: 16000,
    inputPrice: 0,
    outputPrice: 0
  }
];

export const defaultVectorModels: VectorModelItemType[] = [
  {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    inputPrice: 0,
    outputPrice: 0,
    defaultToken: 500,
    maxToken: 3000,
    weight: 100
  }
];
