import { ModelStatusEnum } from '@/constants/model';
import type { ModelSchema, kbSchema } from './mongoSchema';
import { ChatModelType, ModelVectorSearchModeEnum } from '@/constants/model';

export type ModelListItemType = {
  _id: string;
  name: string;
  avatar: string;
  systemPrompt: string;
};

export interface ModelUpdateParams {
  name: string;
  avatar: string;
  chat: ModelSchema['chat'];
  share: ModelSchema['share'];
}

export interface ShareModelItem {
  _id: string;
  avatar: string;
  name: string;
  userId: string;
  share: ModelSchema['share'];
  isCollection: boolean;
}

export type ShareChatEditType = {
  name: string;
  password: string;
  maxContext: number;
};
