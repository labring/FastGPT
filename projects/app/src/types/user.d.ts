import { BillSourceEnum } from '@/constants/user';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import type { BillSchema } from '@/types/common/bill';

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
