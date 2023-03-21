import type { ChatItemType } from './chat';
import { ModelStatusEnum, TrainingStatusEnum, ChatModelNameEnum } from '@/constants/model';

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
  updateTime: number;
  content: ChatItemType[];
}
export interface ChatPopulate extends ChatSchema {
  userId: UserModelSchema;
  modelId: ModelSchema;
}

export interface BillSchema {
  _id: string;
  userId: string;
  chatId: string;
  time: number;
  textLen: number;
  price: number;
}
