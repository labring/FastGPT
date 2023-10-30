import { InformTypeEnum } from './constant';

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

export type UserInformSchema = {
  _id: string;
  userId: string;
  time: Date;
  type: `${InformTypeEnum}`;
  title: string;
  content: string;
  read: boolean;
};
