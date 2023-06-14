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
export enum ClaudeEnum {
  'Claude' = 'Claude'
}

export type ChatModelType = `${OpenAiChatEnum}` | `${ClaudeEnum}`;

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
    contextMaxToken: 4096,
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
  },
  [ClaudeEnum.Claude]: {
    chatModel: ClaudeEnum.Claude,
    name: 'Claude(免费体验)',
    contextMaxToken: 9000,
    systemMaxToken: 2700,
    maxTemperature: 1,
    price: 0
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

export enum ModelStatusEnum {
  running = 'running',
  training = 'training',
  pending = 'pending',
  closed = 'closed'
}

export const formatModelStatus = {
  [ModelStatusEnum.running]: {
    colorTheme: 'green',
    text: '运行中'
  },
  [ModelStatusEnum.training]: {
    colorTheme: 'blue',
    text: '训练中'
  },
  [ModelStatusEnum.pending]: {
    colorTheme: 'gray',
    text: '加载中'
  },
  [ModelStatusEnum.closed]: {
    colorTheme: 'red',
    text: '已关闭'
  }
};

/* 知识库搜索时的配置 */
// 搜索方式
export enum appVectorSearchModeEnum {
  hightSimilarity = 'hightSimilarity', // 高相似度+禁止回复
  lowSimilarity = 'lowSimilarity', // 低相似度
  noContext = 'noContex' // 高相似度+无上下文回复
}
export const ModelVectorSearchModeMap: Record<
  `${appVectorSearchModeEnum}`,
  {
    text: string;
    similarity: number;
  }
> = {
  [appVectorSearchModeEnum.hightSimilarity]: {
    text: '高相似度, 无匹配时拒绝回复',
    similarity: 0.8
  },
  [appVectorSearchModeEnum.noContext]: {
    text: '高相似度，无匹配时直接回复',
    similarity: 0.8
  },
  [appVectorSearchModeEnum.lowSimilarity]: {
    text: '低相似度匹配',
    similarity: 0.3
  }
};

export const defaultModel: ModelSchema = {
  _id: 'modelId',
  userId: 'userId',
  name: '模型名称',
  avatar: '/icon/logo.png',
  status: ModelStatusEnum.pending,
  updateTime: Date.now(),
  chat: {
    relatedKbs: [],
    searchMode: appVectorSearchModeEnum.hightSimilarity,
    systemPrompt: '',
    temperature: 0,
    chatModel: OpenAiChatEnum.GPT35
  },
  share: {
    isShare: false,
    isShareDetail: false,
    intro: '',
    collection: 0
  }
};

export const defaultShareChat: ShareChatEditType = {
  name: '',
  password: '',
  maxContext: 5
};
