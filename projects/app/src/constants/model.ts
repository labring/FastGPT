import type { AppSchema } from '@/types/mongoSchema';
import type { OutLinkEditType } from '@fastgpt/global/support/outLink/type.d';
import type {
  LLMModelItemType,
  ChatModelItemType,
  FunctionModelItemType,
  VectorModelItemType
} from '@/types/model';

export const defaultChatModels: ChatModelItemType[] = [
  {
    model: 'gpt-3.5-turbo',
    name: 'GPT35-4k',
    price: 0,
    maxToken: 4000,
    quoteMaxToken: 2000,
    maxTemperature: 1.2,
    censor: false,
    defaultSystemChatPrompt: ''
  },
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxToken: 16000,
    price: 0,
    quoteMaxToken: 8000,
    maxTemperature: 1.2,
    censor: false,
    defaultSystemChatPrompt: ''
  },
  {
    model: 'gpt-4',
    name: 'GPT4-8k',
    maxToken: 8000,
    price: 0,
    quoteMaxToken: 4000,
    maxTemperature: 1.2,
    censor: false,
    defaultSystemChatPrompt: ''
  }
];
export const defaultQAModels: LLMModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxToken: 16000,
    price: 0
  }
];
export const defaultCQModels: FunctionModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxToken: 16000,
    price: 0,
    functionCall: true,
    functionPrompt: ''
  },
  {
    model: 'gpt-4',
    name: 'GPT4-8k',
    maxToken: 8000,
    price: 0,
    functionCall: true,
    functionPrompt: ''
  }
];
export const defaultExtractModels: FunctionModelItemType[] = [
  {
    model: 'gpt-3.5-turbo-16k',
    name: 'GPT35-16k',
    maxToken: 16000,
    price: 0,
    functionCall: true,
    functionPrompt: ''
  }
];
export const defaultQGModels: LLMModelItemType[] = [
  {
    model: 'gpt-3.5-turbo',
    name: 'GPT35-4K',
    maxToken: 4000,
    price: 0
  }
];

export const defaultVectorModels: VectorModelItemType[] = [
  {
    model: 'text-embedding-ada-002',
    name: 'Embedding-2',
    price: 0,
    defaultToken: 500,
    maxToken: 3000
  }
];

export const defaultApp: AppSchema = {
  _id: '',
  userId: 'userId',
  name: '模型加载中',
  type: 'basic',
  avatar: '/icon/logo.svg',
  intro: '',
  updateTime: Date.now(),
  share: {
    isShare: false,
    isShareDetail: false,
    collection: 0
  },
  modules: []
};

export const defaultOutLinkForm: OutLinkEditType = {
  name: '',
  responseDetail: false,
  limit: {
    QPM: 100,
    credit: -1
  }
};
