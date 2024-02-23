import { InformTypeEnum, UserStatusEnum } from './constant';
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
  status: `${UserStatusEnum}`;
  lastLoginTmbId?: string;
  openaiAccount?: {
    key: string;
    baseUrl: string;
  };
};
export enum UserStandardEnum {
  free = 'free',
  trial = 'trial',
  team = 'team',
  enterprise = 'enterprise'
}

export type standardInfoType = {
  datasetMaxSize: number,
  expiredTime: string,
  currentSubLevel: `${UserStandardEnum}`,
  totalPoints: number,
  currentMode: string,
  pointPrice: number,
  price: number,
  status: string,
  surplusPoints: number,
  totalPoints: number,
  type: string,
  standardMaxDatasetSize: number,
  standardMaxPoints: number,
  totalPoints: number,
  usedDatasetSize: number,
  usedPoints: number,
}

export type UserType = {
  _id: string;
  username: string;
  avatar: string;
  balance: number;
  timezone: string;
  promotionRate: UserModelSchema['promotionRate'];
  openaiAccount: UserModelSchema['openaiAccount'];
  team: TeamItemType;
  standardInfo?: standardInfoType
};
