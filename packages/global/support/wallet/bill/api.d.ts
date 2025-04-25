import { StandardSubLevelEnum, SubModeEnum } from '../sub/constants';
import { BillTypeEnum, DrawBillQRItem } from './constants';

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
  qrItem: string;
  readPrice: number;
  payment: BillPayWayEnum;
  type: DrawBillQRItem;
};

export type CreateBillQRItemProps = {
  billId: string;
  payWay: BillPayWayEnum;
};

export type CreateQRCodeItemResponse = {
  qrItem: string;
  type: DrawBillQRItem;
};
