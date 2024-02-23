import { CreateBillProps } from './api';
import { BillSourceEnum } from './constants';

export type BillListItemCountType = {
  inputTokens?: number;
  outputTokens?: number;
  charsLength?: number;
  duration?: number;

  // sub
  datasetSize?: number;

  // abandon
  tokenLen?: number;
};
export type BillListItemType = BillListItemCountType & {
  moduleName: string;
  amount: number;
  model?: string;
};

export type BillSchema = CreateBillProps & {
  _id: string;
  time: Date;
};

export type BillItemType = {
  id: string;
  // memberName: string;
  time: Date;
  appName: string;
  source: BillSchema['source'];
  total: number;
  list: BillSchema['list'];
};
