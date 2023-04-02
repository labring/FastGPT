import type { ChatItemType } from './chat';
import { ModelStatusEnum, TrainingStatusEnum, ChatModelNameEnum } from '@/constants/model';
import type { DataType } from './data';

export type ServiceName = 'openai';

export interface UserModelSchema {
  _id: string;
  email: string;
  password: string;
  balance: number;
  accounts: { type: 'openai'; value: string }[];
  createTime: number;
}

export interface AuthCodeSchema {
  _id: string;
  email: string;
  code: string;
  type: 'register' | 'findPassword';
  expiredTime: number;
}

export interface ModelSchema {
  _id: string;
  name: string;
  avatar: string;
  systemPrompt: string;
  intro: string;
  userId: string;
  status: `${ModelStatusEnum}`;
  updateTime: number;
  trainingTimes: number;
  temperature: number;
  service: {
    company: ServiceName;
    trainId: string; // 训练的模型，训练后就是训练的模型id
    chatModel: string; // 聊天时用的模型，训练后就是训练的模型
    modelName: `${ChatModelNameEnum}`; // 底层模型名称，不会变
  };
  security: {
    domain: string[];
    contextMaxLen: number;
    contentMaxLen: number;
    expiredTime: number;
    maxLoadAmount: number;
  };
}

export interface ModelPopulate extends ModelSchema {
  userId: UserModelSchema;
}

export type ModelDataType = 0 | 1;
export interface ModelDataSchema {
  _id: string;
  modelId: string;
  userId: string;
  text: string;
  q: {
    id: string;
    text: string;
  };
  status: ModelDataType;
}

export interface ModelSplitDataSchema {
  _id: string;
  userId: string;
  modelId: string;
  rawText: string;
  prompt: string;
  errorText: string;
  textList: string[];
}

export interface TrainingSchema {
  _id: string;
  serviceName: ServiceName;
  tuneId: string;
  modelId: string;
  status: `${TrainingStatusEnum}`;
}

export interface TrainingPopulate extends TrainingSchema {
  modelId: ModelSchema;
}

export interface ChatSchema {
  _id: string;
  userId: string;
  modelId: string;
  expiredTime: number;
  loadAmount: number;
  updateTime: Date;
  isShare: boolean;
  content: ChatItemType[];
}
export interface ChatPopulate extends ChatSchema {
  userId: UserModelSchema;
  modelId: ModelSchema;
}

export interface BillSchema {
  _id: string;
  userId: string;
  type: 'chat' | 'splitData' | 'return';
  chatId: string;
  time: Date;
  textLen: number;
  tokenLen: number;
  price: number;
}

export interface PaySchema {
  _id: string;
  userId: string;
  createTime: Date;
  price: number;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
}

export interface DataSchema {
  _id: string;
  userId: string;
  name: string;
  createTime: string;
  type: DataType;
}

export interface DataItemSchema {
  _id: string;
  userId: string;
  dataId: string;
  type: DataType;
  times: number;
  text: string;
  rawResponse: string[];
  result: {
    q?: string;
    a?: string;
    abstract?: string;
  }[];
  status: 0 | 1 | 2;
}

export interface DataItemPopulate extends DataItemSchema {
  userId: UserModelSchema;
}
