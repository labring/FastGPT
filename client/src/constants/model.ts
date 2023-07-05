import type { ShareChatEditType } from '@/types/model';
import type { ModelSchema } from '@/types/mongoSchema';

export const embeddingModel = 'text-embedding-ada-002';
export const embeddingPrice = 0.1;
export type EmbeddingModelType = 'text-embedding-ada-002';

export enum OpenAiChatEnum {
  'GPT35' = 'gpt-3.5-turbo',
  'GPT3516k' = 'gpt-3.5-turbo-16k',
  'GPT4' = 'gpt-4',
  'GPT432k' = 'gpt-4-32k',
  'GPT4LOW' = 'gpt-4-0314'
}

export type ChatModelType = `${OpenAiChatEnum}`;

export type ChatModelItemType = {
  chatModel: ChatModelType;
  name: string;
  contextMaxToken: number;
  systemMaxToken: number;
  maxTemperature: number;
  price: number;
};

export const ChatModelMap = {
  [OpenAiChatEnum.GPT4LOW]: {
    chatModel: OpenAiChatEnum.GPT4LOW,
    name: '窝牛Gpt4不稳定',
    contextMaxToken: 4000,
    systemMaxToken: 2400,
    maxTemperature: 1.2,
    price: 1.5
  },
  [OpenAiChatEnum.GPT35]: {
    chatModel: OpenAiChatEnum.GPT35,
    name: 'Gpt35-4k',
    contextMaxToken: 4000,
    systemMaxToken: 2400,
    maxTemperature: 1.2,
    price: 1.5
  },
  [OpenAiChatEnum.GPT3516k]: {
    chatModel: OpenAiChatEnum.GPT3516k,
    name: 'Gpt35-16k',
    contextMaxToken: 16000,
    systemMaxToken: 8000,
    maxTemperature: 1.2,
    price: 3
  },
  [OpenAiChatEnum.GPT4]: {
    chatModel: OpenAiChatEnum.GPT4,
    name: 'Gpt4',
    contextMaxToken: 8000,
    systemMaxToken: 4000,
    maxTemperature: 1.2,
    price: 45
  },
  [OpenAiChatEnum.GPT432k]: {
    chatModel: OpenAiChatEnum.GPT432k,
    name: 'Gpt4-32k',
    contextMaxToken: 32000,
    systemMaxToken: 8000,
    maxTemperature: 1.2,
    price: 90
  }
};

export const chatModelList: ChatModelItemType[] = [
  ChatModelMap[OpenAiChatEnum.GPT3516k],
  ChatModelMap[OpenAiChatEnum.GPT35],
  ChatModelMap[OpenAiChatEnum.GPT4LOW],
  ChatModelMap[OpenAiChatEnum.GPT4]
];

export const defaultModel: ModelSchema = {
  _id: 'modelId',
  userId: 'userId',
  name: '模型名称',
  avatar: '/icon/logo.png',
  intro: '',
  updateTime: Date.now(),
  chat: {
    relatedKbs: [],
    searchSimilarity: 0.2,
    searchLimit: 5,
    searchEmptyText: '',
    systemPrompt: '',
    limitPrompt: '',
    temperature: 0,
    maxToken: 4000,
    chatModel: OpenAiChatEnum.GPT35
  },
  share: {
    isShare: false,
    isShareDetail: false,
    collection: 0
  }
};

export const defaultShareChat: ShareChatEditType = {
  name: '',
  password: '',
  maxContext: 5
};
