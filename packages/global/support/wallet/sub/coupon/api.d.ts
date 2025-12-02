import type { DiscountCouponTypeEnum, DiscountCouponStatusEnum } from './constants';

export type DiscountCouponListResponse = {
  _id: string;
  teamId: string;
  type: `${DiscountCouponTypeEnum}`;
  name: string;
  description: string;
  discount: number;
  icon: string;
  iconZh: string;
  iconEn: string;
  status: `${DiscountCouponStatusEnum}`;
  startTime?: Date;
  expiredTime: Date;
  usedAt?: Date;
  billId?: string;
  createTime: Date;
}[];
