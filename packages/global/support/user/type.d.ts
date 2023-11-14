import { InformTypeEnum } from './constant';
import { TeamItemType } from './team/type';

export type UserModelSchema = {
  _id: string;
  username: string;
  password: string;
  avatar: string;
  balance: number;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
  openaiAccount?: {
    key: string;
    baseUrl: string;
  };
  limit: {
    exportKbTime?: Date;
    datasetMaxCount?: number;
  };
};

export type UserType = {
  _id: string;
  username: string;
  avatar: string;
  balance: number;
  timezone: string;
  promotionRate: UserModelSchema['promotionRate'];
  openaiAccount: UserModelSchema['openaiAccount'];
  team: TeamItemType;
};
