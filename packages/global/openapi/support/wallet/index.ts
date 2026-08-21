import type { OpenAPIPath } from '../../type';
import { BillPath } from './bill';
import { DiscountCouponPath } from './discountCoupon';
import { CouponPath } from './coupon';

export const WalletPath: OpenAPIPath = {
  ...BillPath,
  ...DiscountCouponPath,
  ...CouponPath
};
