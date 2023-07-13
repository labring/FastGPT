import { BillSourceEnum } from '@/constants/user';
import type { BillSchema } from './mongoSchema';
export interface UserType {
  _id: string;
  username: string;
  avatar: string;
  openaiKey: string;
  balance: number;
  promotion: {
    rate: number;
  };
}

export interface UserUpdateParams {
  balance?: number;
  avatar?: string;
  openaiKey?: string;
}

export interface UserBillType {
  id: string;
  time: Date;
  appName: string;
  source: BillSchema['source'];
  total: number;
}
