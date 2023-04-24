import type { ModelSchema } from '@/types/mongoSchema';

export enum ModelDataStatusEnum {
  ready = 'ready',
  waiting = 'waiting'
}

export enum ChatModelNameEnum {
  GPT35 = 'gpt-3.5-turbo',
  VECTOR_GPT = 'VECTOR_GPT',
  VECTOR = 'text-embedding-ada-002'
}

export const ChatModelNameMap = {
  [ChatModelNameEnum.GPT35]: 'gpt-3.5-turbo',
  [ChatModelNameEnum.VECTOR_GPT]: 'gpt-3.5-turbo',
  [ChatModelNameEnum.VECTOR]: 'text-embedding-ada-002'
};

export type ModelConstantsData = {
  icon: 'model' | 'dbModel';
  name: string;
  model: `${ChatModelNameEnum}`;
  trainName: string; // 空字符串代表不能训练
  maxToken: number;
  contextMaxToken: number;
  maxTemperature: number;
  price: number; // 多少钱 / 1token，单位: 0.00001元
};

export const modelList: ModelConstantsData[] = [
  {
    icon: 'model',
    name: 'chatGPT',
    model: ChatModelNameEnum.GPT35,
    trainName: '',
    maxToken: 4000,
    contextMaxToken: 7000,
    maxTemperature: 1.5,
    price: 3
  },
  {
    icon: 'dbModel',
    name: '知识库',
    model: ChatModelNameEnum.VECTOR_GPT,
    trainName: 'vector',
    maxToken: 4000,
    contextMaxToken: 7000,
    maxTemperature: 1,
    price: 3
  }
];

export enum TrainingStatusEnum {
  pending = 'pending',
  succeed = 'succeed',
  errored = 'errored',
  canceled = 'canceled'
}

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
  _id: '',
  userId: '',
  name: 'modelName',
  avatar: '',
  status: ModelStatusEnum.pending,
  updateTime: Date.now(),
  trainingTimes: 0,
  systemPrompt: '',
  intro: '',
  temperature: 5,
  search: {
    mode: ModelVectorSearchModeEnum.hightSimilarity
  },
  service: {
    trainId: '',
    chatModel: ChatModelNameEnum.GPT35,
    modelName: ChatModelNameEnum.GPT35
  },
  security: {
    domain: ['*'],
    contextMaxLen: 1,
    contentMaxLen: 1,
    expiredTime: 9999,
    maxLoadAmount: 1
  }
};
