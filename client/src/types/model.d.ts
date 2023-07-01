import type { AppSchema, kbSchema } from './mongoSchema';
import { ChatModelType } from '@/constants/model';

export type ModelListItemType = {
  _id: string;
  name: string;
  avatar: string;
  intro: string;
};

export interface ModelUpdateParams {
  name?: string;
  avatar?: string;
  intro?: string;
  chat?: AppSchema['chat'];
  share?: AppSchema['share'];
  modules?: AppSchema['modules'];
}

export interface ShareModelItem {
  _id: string;
  avatar: string;
  name: string;
  intro: string;
  userId: string;
  share: AppSchema['share'];
  isCollection: boolean;
}

export type ShareChatEditType = {
  name: string;
  password: string;
  maxContext: number;
};
