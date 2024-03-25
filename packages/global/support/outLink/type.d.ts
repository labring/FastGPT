import { AppSchema } from 'core/app/type';
import { OutLinkTypeEnum } from './constant';

export type OutLinkSchema = {
  _id: string;
  shareId: string;
  teamId: string;
  tmbId: string;
  appId: string;
  name: string;
  usagePoints: number;
  lastTime: Date;
  type: `${OutLinkTypeEnum}`;
  responseDetail: boolean;
  limit?: {
    expiredTime?: Date;
    QPM: number;
    maxUsagePoints: number;
    hookUrl?: string;
  };
};
export type OutLinkWithAppType = Omit<OutLinkSchema, 'appId'> & {
  appId: AppSchema;
};

export type OutLinkEditType = {
  _id?: string;
  name: string;
  responseDetail: OutLinkSchema['responseDetail'];
  limit: OutLinkSchema['limit'];
};
