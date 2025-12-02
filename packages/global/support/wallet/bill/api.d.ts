import type { StandardSubLevelEnum, SubModeEnum } from '../sub/constants';
import type { BillTypeEnum, BillPayWayEnum, BillStatusEnum } from './constants';
import { DrawBillQRItem } from './constants';

export type CreateOrderResponse = {
  qrCode?: string;
  iframeCode?: string;
  markdown?: string;
};

export type CreateStandPlanBill = {
  type: BillTypeEnum.standSubPlan;
  level: `${StandardSubLevelEnum}`;
  subMode: `${SubModeEnum}`;
  discountCouponId?: string;
};
type CreateExtractPointsBill = {
  type: BillTypeEnum.extraPoints;
  extraPoints: number;
  discountCouponId?: string; // not used
};
type CreateExtractDatasetBill = {
  type: BillTypeEnum.extraDatasetSub;
  extraDatasetSize: number;
  month: number;
  discountCouponId?: string; // not used
};
export type CreateBillProps =
  | CreateStandPlanBill
  | CreateExtractPointsBill
  | CreateExtractDatasetBill;

export type CreateBillResponse = {
  billId: string;
  readPrice: number;
  payment: BillPayWayEnum;
} & CreateOrderResponse;

export type UpdatePaymentProps = {
  billId: string;
  payWay: BillPayWayEnum;
};

export type CheckPayResultResponse = {
  status: BillStatusEnum;
  description?: string;
};

export type BillDetailResponse = BillSchemaType & {
  couponName?: string;
};
