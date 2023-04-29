import type { ModelSchema } from '@/types/mongoSchema';

export const embeddingModel = 'text-embedding-ada-002';

export enum ChatModelEnum {
  'GPT35' = 'gpt-3.5-turbo',
  'GPT4' = 'gpt-4',
  'GPT432k' = 'gpt-4-32k'
}
export const ChatModelMap = {
  // ui name
  [ChatModelEnum.GPT35]: 'ChatGpt',
  [ChatModelEnum.GPT4]: 'Gpt4',
  [ChatModelEnum.GPT432k]: 'Gpt4-32k'
};

export type ChatModelConstantType = {
  chatModel: `${ChatModelEnum}`;
  contextMaxToken: number;
  maxTemperature: number;
  price: number; // 多少钱 / 1token，单位: 0.00001元
};

export const modelList: ChatModelConstantType[] = [
  {
    chatModel: ChatModelEnum.GPT35,
    contextMaxToken: 4096,
    maxTemperature: 1.5,
    price: 3
  }
];

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

export enum ModelDataStatusEnum {
  ready = 'ready',
  waiting = 'waiting'
}

export const ModelDataStatusMap: Record<`${ModelDataStatusEnum}`, string> = {
  ready: '训练完成',
  waiting: '训练中'
};

/* 知识库搜索时的配置 */
// 搜索方式
export enum ModelVectorSearchModeEnum {
  hightSimilarity = 'hightSimilarity', // 高相似度+禁止回复
  lowSimilarity = 'lowSimilarity', // 低相似度
  noContext = 'noContex' // 高相似度+无上下文回复
}
export const ModelVectorSearchModeMap: Record<
  `${ModelVectorSearchModeEnum}`,
  {
    text: string;
    similarity: number;
  }
> = {
  [ModelVectorSearchModeEnum.hightSimilarity]: {
    text: '高相似度, 无匹配时拒绝回复',
    similarity: 0.2
  },
  [ModelVectorSearchModeEnum.noContext]: {
    text: '高相似度，无匹配时直接回复',
    similarity: 0.2
  },
  [ModelVectorSearchModeEnum.lowSimilarity]: {
    text: '低相似度匹配',
    similarity: 0.8
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
    useKb: false,
    searchMode: ModelVectorSearchModeEnum.hightSimilarity,
    systemPrompt: '',
    temperature: 0,
    chatModel: ChatModelEnum.GPT35
  },
  share: {
    isShare: false,
    isShareDetail: false,
    intro: '',
    collection: 0
  },
  security: {
    domain: ['*'],
    contextMaxLen: 1,
    contentMaxLen: 1,
    expiredTime: 9999,
    maxLoadAmount: 1
  }
};
