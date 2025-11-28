import type { StandardSubLevelEnum } from '../sub/constants';
import type { CouponSceneEnum, CouponStatusEnum, CouponTypeEnum } from './constants';

/**
 * 优惠券Schema类型
 */
export type CouponSchemaType = {
  _id: string;
  teamId: string;
  name: string;
  discount: number;
  scenes: CouponSceneEnum[];
  status: CouponStatusEnum;
  startTime: Date;
  expiredTime: Date;
  usedTime?: Date;
  billId?: string; // 关联的账单ID
  createTime: Date;
  type: CouponTypeEnum[]; // 优惠券类型
  level?: `${StandardSubLevelEnum}`[];
};

/**
 * 创建优惠券的参数
 */
export type CreateCouponParams = {
  teamId: string;
  name: string;
  discount: number;
  scenes: CouponSceneEnum[];
  type: CouponTypeEnum[];
  level?: `${StandardSubLevelEnum}`[];
  startTime?: Date;
  expiredTime?: Date;
};

/**
 * 使用优惠券的参数
 */
export type UseCouponParams = {
  couponId: string;
  billId: string;
};
