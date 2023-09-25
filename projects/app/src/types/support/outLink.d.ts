import { OutLinkTypeEnum } from '@/constants/chat';

export interface OutLinkSchema {
  _id: string;
  shareId: string;
  userId: string;
  appId: string;
  name: string;
  total: number;
  lastTime: Date;
  type: `${OutLinkTypeEnum}`;
  responseDetail: boolean;
  limit?: {
    expiredTime?: Date;
    QPM: number;
    credit: number;
    hookUrl?: string;
  };
}

export type OutLinkEditType = {
  _id?: string;
  name: string;
  responseDetail: OutLinkSchema['responseDetail'];
  limit: OutLinkSchema['limit'];
};
