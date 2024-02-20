import { BillTypeEnum } from './constants';

export type GetPayQRCodeProps = {
  type: `${BillTypeEnum}`;

  // balance
  balance?: number; // read

  month?: number;
  // extra dataset size
  extraDatasetSize?: number; // 1k
  extraPoints?: number; // 100w
};
export type GetPayQRCodeResponse = {
  payId: string;
  codeUrl: string;
  readPrice: number;
};
