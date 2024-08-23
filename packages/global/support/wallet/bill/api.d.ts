import { StandardSubLevelEnum, SubModeEnum } from '../sub/constants';
import { BillTypeEnum } from './constants';

export type CreateStandPlanBill = {
  type: BillTypeEnum.standSubPlan;
  level: `${StandardSubLevelEnum}`;
  subMode: `${SubModeEnum}`;
};
type CreateExtractPointsBill = {
  type: BillTypeEnum.extraPoints;
  extraPoints: number;
};
type CreateExtractDatasetBill = {
  type: BillTypeEnum.extraDatasetSub;
  extraDatasetSize: number;
  month: number;
};
export type CreateBillProps =
  | CreateStandPlanBill
  | CreateExtractPointsBill
  | CreateExtractDatasetBill;

export type CreateBillResponse = {
  billId: string;
  codeUrl: string;
  readPrice: number;
};
