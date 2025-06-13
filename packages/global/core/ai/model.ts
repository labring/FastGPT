import { i18nT } from '../../../web/i18n/utils';
import type { LLMModelItemType, STTModelType, EmbeddingModelItemType } from './model.d';
import { getModelProvider, type ModelProviderIdType } from './provider';

export enum ModelTypeEnum {
  llm = 'llm',
  embedding = 'embedding',
  tts = 'tts',
  stt = 'stt',
  rerank = 'rerank'
}

export const defaultQAModels: LLMModelItemType[] = [
  {
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'gpt-4o-mini',
    name: 'gpt-4o-mini',
    maxContext: 16000,
    maxResponse: 16000,
    quoteMaxToken: 13000,
    maxTemperature: 1.2,
    charsPointsPrice: 0,
    censor: false,
    vision: true,
    datasetProcess: true,
    toolChoice: true,
    functionCall: false,
    defaultSystemChatPrompt: '',
    defaultConfig: {}
  }
];

export const defaultVectorModels: EmbeddingModelItemType[] = [
  {
    type: ModelTypeEnum.embedding,
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding-2',
    charsPointsPrice: 0,
    defaultToken: 500,
    maxToken: 3000,
    weight: 100
  }
];

export const defaultSTTModels: STTModelType[] = [
  {
    type: ModelTypeEnum.stt,
    provider: 'OpenAI',
    model: 'whisper-1',
    name: 'whisper-1',
    charsPointsPrice: 0
  }
];

export const getModelFromList = (
  modelList: { provider: ModelProviderIdType; name: string; model: string }[],
  model: string
):
  | {
      avatar: string;
      provider: ModelProviderIdType;
      name: string;
      model: string;
    }
  | undefined => {
  const modelData = modelList.find((item) => item.model === model) ?? modelList[0];
  if (!modelData) {
    return;
  }
  const provider = getModelProvider(modelData.provider);
  return {
    ...modelData,
    avatar: provider.avatar
  };
};

export const modelTypeList = [
  { label: i18nT('common:model.type.chat'), value: ModelTypeEnum.llm },
  { label: i18nT('common:model.type.embedding'), value: ModelTypeEnum.embedding },
  { label: i18nT('common:model.type.tts'), value: ModelTypeEnum.tts },
  { label: i18nT('common:model.type.stt'), value: ModelTypeEnum.stt },
  { label: i18nT('common:model.type.reRank'), value: ModelTypeEnum.rerank }
];
