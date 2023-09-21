import { BillSourceEnum } from '@/constants/user';
import type { BillListItemType } from '@/types/common/bill';

export type BillListItemType = {
  moduleName: string;
  amount: number;
  model?: string;
  tokenLen?: number;
};

export type CreateBillType = {
  userId: string;
  appName: string;
  appId?: string;
  total: number;
  source: `${BillSourceEnum}`;
  list: BillListItemType[];
};

export type BillSchema = CreateBillType & {
  _id: string;
  time: Date;
};
