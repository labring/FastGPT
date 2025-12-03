import type { DiscountCouponTypeEnum } from './constants';

export type DiscountCouponSchema = {
  _id: string;
  teamId: string;
  type: `${DiscountCouponTypeEnum}`;

  startTime?: Date;
  expiredTime: Date;
  usedAt?: Date;

  createTime: Date;
};
