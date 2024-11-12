import { TeamPermission } from '../permission/user/controller';
import { UserStatusEnum } from './constant';
import { TeamTmbItemType } from './team/type';

export type UserModelSchema = {
  _id: string;
  username: string;
  password: string;
  avatar: string;
  promotionRate: number;
  inviterId?: string;
  openaiKey: string;
  createTime: number;
  timezone: string;
  status: `${UserStatusEnum}`;
  lastLoginTmbId?: string;
  openaiAccount?: {
    key: string;
    baseUrl: string;
  };
  fastgpt_sem?: {
    keyword: string;
  };
};

export type UserType = {
  _id: string;
  username: string;
  avatar: string;
  timezone: string;
  promotionRate: UserModelSchema['promotionRate'];
  openaiAccount: UserModelSchema['openaiAccount'];
  team: TeamTmbItemType;
  standardInfo?: standardInfoType;
  notificationAccount?: string;
  permission: TeamPermission;
};
