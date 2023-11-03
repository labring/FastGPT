import type { ChatItemType } from './chat';
import { ModelNameEnum, ChatModelType, EmbeddingModelType } from '@/constants/model';
import type { DataType } from './data';
import { InformTypeEnum } from '@/constants/user';
import { TrainingModeEnum } from '@/constants/plugin';
import { ChatSourceEnum } from '@/constants/chat';
import { MarkDataType } from '@/global/core/dataset/type';

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
