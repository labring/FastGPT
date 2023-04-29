import type { ChatItemType } from './chat';
import {
  ModelStatusEnum,
  ModelNameEnum,
  ModelVectorSearchModeEnum,
  ChatModelEnum
} from '@/constants/model';
import type { DataType } from './data';

export interface UserModelSchema {
  _id: string;
  username: string;
  password: string;
  balance: number;
  inviterId?: string;
  promotionAmount: number;
  openaiKey: string;
  createTime: number;
  promotion: {
    rate: number;
  };
}

export interface AuthCodeSchema {
  _id: string;
  username: string;
  code: string;
  type: 'register' | 'findPassword';
  expiredTime: number;
}

export interface ModelSchema {
  _id: string;
  userId: string;
  name: string;
  avatar: string;
  status: `${ModelStatusEnum}`;
  updateTime: number;
  chat: {
    useKb: boolean;
    searchMode: `${ModelVectorSearchModeEnum}`;
    systemPrompt: string;
    temperature: number;
    chatModel: `${ChatModelEnum}`; // 聊天时用的模型，训练后就是训练的模型
  };
  share: {
    isShare: boolean;
    isShareDetail: boolean;
    intro: string;
    collection: number;
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

export interface CollectionSchema {
  modelId: string;
  userId: string;
}

export type ModelDataType = 0 | 1;
export interface ModelDataSchema {
  _id: string;
  modelId: string;
  userId: string;
  a: string;
  q: string;
  status: ModelDataType;
}

export interface ModelSplitDataSchema {
  _id: string;
  userId: string;
  modelId: string;
  prompt: string;
  errorText: string;
  textList: string[];
}

export interface ChatSchema {
  _id: string;
  userId: string;
  modelId: string;
  expiredTime: number;
  loadAmount: number;
  updateTime: Date;
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

export interface OpenApiSchema {
  _id: string;
  userId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: String;
}

export interface PromotionRecordSchema {
  _id: string;
  userId: string; // 收益人
  objUId?: string; // 目标对象（如果是withdraw则为空）
  type: 'invite' | 'shareModel' | 'withdraw';
  createTime: Date; // 记录时间
  amount: number;
}
