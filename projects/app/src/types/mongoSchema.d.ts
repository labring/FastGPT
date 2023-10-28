import type { ChatItemType } from './chat';
import { ModelNameEnum, ChatModelType, EmbeddingModelType } from '@/constants/model';
import type { DataType } from './data';
import { InformTypeEnum } from '@/constants/user';
import { TrainingModeEnum } from '@/constants/plugin';
import type { ModuleItemType } from '@fastgpt/global/core/module/type';
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
  modules: ModuleItemType[];
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
