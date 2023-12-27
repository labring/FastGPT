import { CreateBillProps } from './api';
import { BillSourceEnum } from './constants';

export type BillListItemType = {
  moduleName: string;
  amount: number;
  model?: string;
  textLen?: number;
  tokenLen?: number;
  duration?: number;
};

export type BillSchema = CreateBillProps & {
  _id: string;
  time: Date;
};

export type BillItemType = {
  id: string;
  memberName: string;
  time: Date;
  appName: string;
  source: BillSchema['source'];
  total: number;
  list: BillSchema['list'];
};
