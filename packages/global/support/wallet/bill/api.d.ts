import { BillTypeEnum } from './constants';

type CreateStandPlanBill = {
  type: BillTypeEnum.standSubPlan;
};
export type CreateBillProps = {
  type: BillTypeEnum;

  // balance
  balance?: number; // read

  month?: number;

  // extra dataset size
  extraDatasetSize?: number; // 1k
  extraPoints?: number; // 100w
};

export type CreateBillResponse = {
  billId: string;
  codeUrl: string;
  readPrice: number;
};
