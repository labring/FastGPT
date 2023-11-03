import { BillSourceEnum } from '@fastgpt/global/common/bill/constants';
import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import { BillSchema } from '@fastgpt/global/common/bill/type.d';

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
