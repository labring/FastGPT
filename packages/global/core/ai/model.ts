import { i18nT } from '../../common/i18n/utils';
import type { LLMModelItemType, STTModelType, EmbeddingModelItemType } from './model.schema';

export enum ModelTypeEnum {
  llm = 'llm',
  embedding = 'embedding',
  tts = 'tts',
  stt = 'stt',
  rerank = 'rerank'
}

export const defaultQAModels: LLMModelItemType[] = [
  {
    id: 'default-llm-gpt5',
    type: ModelTypeEnum.llm,
    provider: 'OpenAI',
    model: 'gpt-5',
    name: 'gpt-5',
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
    id: 'default-embedding-3-small',
    type: ModelTypeEnum.embedding,
    provider: 'OpenAI',
    model: 'text-embedding-3-small',
    name: 'Embedding-2',
    charsPointsPrice: 0,
    defaultToken: 500,
    maxToken: 3000,
    weight: 100,
    batchSize: 10
  }
];

export const defaultSTTModels: STTModelType[] = [
  {
    id: 'default-stt-whisper',
    type: ModelTypeEnum.stt,
    provider: 'OpenAI',
    model: 'whisper-1',
    name: 'whisper-1',
    charsPointsPrice: 0
  }
];

export const getModelFromList = <T extends { id: string }>(
  list: T[],
  modelId: string
): T | undefined => {
  return list.find((item) => item.id === modelId);
};

export const modelTypeList = [
  { label: i18nT('common:model.type.chat'), value: ModelTypeEnum.llm },
  { label: i18nT('common:model.type.embedding'), value: ModelTypeEnum.embedding },
  { label: i18nT('common:model.type.tts'), value: ModelTypeEnum.tts },
  { label: i18nT('common:model.type.stt'), value: ModelTypeEnum.stt },
  { label: i18nT('common:model.type.reRank'), value: ModelTypeEnum.rerank }
];
