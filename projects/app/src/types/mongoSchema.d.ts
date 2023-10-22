import type { ChatItemType } from './chat';
import { ModelNameEnum, ChatModelType, EmbeddingModelType } from '@/constants/model';
import type { DataType } from './data';
import { InformTypeEnum } from '@/constants/user';
import { TrainingModeEnum } from '@/constants/plugin';
import type { AppModuleItemType } from './app';
import { ChatSourceEnum } from '@/constants/chat';
import { AppTypeEnum } from '@/constants/app';
import { MarkDataType } from '@/global/core/dataset/type';

export interface AuthCodeSchema {
  _id: string;
  username: string;
  code: string;
  type: 'register' | 'findPassword';
  expiredTime: number;
}

export interface AppSchema {
  _id: string;
  userId: string;
  name: string;
  type: `${AppTypeEnum}`;
  avatar: string;
  intro: string;
  updateTime: number;
  share: {
    isShare: boolean;
    isShareDetail: boolean;
    collection: number;
  };
  modules: AppModuleItemType[];
}

export interface CollectionSchema {
  appId: string;
  userId: string;
}

export interface ChatSchema {
  _id: string;
  chatId: string;
  userId: string;
  appId: string;
  updateTime: Date;
  title: string;
  customTitle: string;
  top: boolean;
  variables: Record<string, any>;
  source: `${ChatSourceEnum}`;
  shareId?: string;
  isInit: boolean;
  content: ChatItemType[];
}

export interface ChatItemSchema extends ChatItemType {
  dataId: string;
  chatId: string;
  userId: string;
  appId: string;
  time: Date;
  userFeedback?: string;
  adminFeedback?: MarkDataType;
}

export interface PaySchema {
  _id: string;
  userId: string;
  createTime: Date;
  price: number;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
}

export interface PromotionRecordSchema {
  _id: string;
  userId: string; // 收益人
  objUId?: string; // 目标对象（如果是withdraw则为空）
  type: 'register' | 'pay';
  createTime: Date; // 记录时间
  amount: number;
}

export interface informSchema {
  _id: string;
  userId: string;
  time: Date;
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
  read: boolean;
}
