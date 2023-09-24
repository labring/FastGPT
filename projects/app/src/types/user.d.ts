import { BillSourceEnum } from '@/constants/user';
import type { UserModelSchema } from './mongoSchema';
import type { BillSchema } from '@/types/common/bill';

export interface UserType {
  _id: string;
  username: string;
  avatar: string;
  balance: number;
  timezone: string;
  promotionRate: UserModelSchema['promotionRate'];
  openaiAccount: UserModelSchema['openaiAccount'];
}

export interface UserUpdateParams {
  balance?: number;
  avatar?: string;
  timezone?: string;
  openaiAccount?: UserModelSchema['openaiAccount'];
}

export interface UserBillType {
  id: string;
  time: Date;
  appName: string;
  source: BillSchema['source'];
  total: number;
  list: BillSchema['list'];
}
