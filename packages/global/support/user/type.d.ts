import { InformTypeEnum, TeamMemberRoleEnum } from './constant';

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

export type TeamSchema = {
  _id: string;
  name: string;
  ownerId: string;
  avatar: string;
  createTime: Date;
};

export type TeamMemberSchema = {
  _id: string;
  name: string;
  teamId: string;
  userId: string;
  role: `${TeamMemberRoleEnum}`;
};
