import { BillSourceEnum } from './constants';

export type BillListItemType = {
  moduleName: string;
  amount: number;
  model?: string;
  tokenLen?: number;
};

export type CreateBillType = {
  teamId: string;
  tmbId: string;
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

export type ConcatBillProps = {
  teamId: string;
  tmbId: string;
  billId?: string;
  total: number;
  listIndex?: number;
  tokens?: number;
};
