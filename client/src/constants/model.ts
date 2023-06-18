import { getSystemModelList } from '@/api/system';
import type { ShareChatEditType } from '@/types/model';
import type { ModelSchema } from '@/types/mongoSchema';

export const embeddingModel = 'text-embedding-ada-002';
export const embeddingPrice = 0.1;
export type EmbeddingModelType = 'text-embedding-ada-002';

export enum OpenAiChatEnum {
  'GPT35' = 'gpt-3.5-turbo',
  'GPT3516k' = 'gpt-3.5-turbo-16k',
  'GPT4' = 'gpt-4',
  'GPT432k' = 'gpt-4-32k'
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
  [OpenAiChatEnum.GPT35]: {
    chatModel: OpenAiChatEnum.GPT35,
    name: 'Gpt35-4k',
    contextMaxToken: 4000,
    systemMaxToken: 2400,
    maxTemperature: 1.2,
    price: 2.2
  },
  [OpenAiChatEnum.GPT3516k]: {
    chatModel: OpenAiChatEnum.GPT3516k,
    name: 'Gpt35-16k',
    contextMaxToken: 16000,
    systemMaxToken: 8000,
    maxTemperature: 1.2,
    price: 2.5
  },
  [OpenAiChatEnum.GPT4]: {
    chatModel: OpenAiChatEnum.GPT4,
    name: 'Gpt4',
    contextMaxToken: 8000,
    systemMaxToken: 4000,
    maxTemperature: 1.2,
    price: 50
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

let chatModelList: ChatModelItemType[] = [];
export const getChatModelList = async () => {
  if (chatModelList.length > 0) {
    return chatModelList;
  }
  const list = await getSystemModelList();
  chatModelList = list;
  return list;
};

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
