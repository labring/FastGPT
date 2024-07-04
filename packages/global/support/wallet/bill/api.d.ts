import { BillTypeEnum } from './constants';

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
