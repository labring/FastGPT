import { BillSourceEnum } from './constants';
import { BillListItemCountType, BillListItemType } from './type';

export type CreateTrainingBillProps = {
  name: string;
  vectorModel?: string;
  agentModel?: string;
};

export type ConcatBillProps = BillListItemCountType & {
  teamId: string;
  tmbId: string;
  billId?: string;
  total: number;
  listIndex?: number;
};

export type CreateBillProps = {
  teamId: string;
  tmbId: string;
  appName: string;
  appId?: string;
  total: number;
  source: `${BillSourceEnum}`;
  list: BillListItemType[];
};
