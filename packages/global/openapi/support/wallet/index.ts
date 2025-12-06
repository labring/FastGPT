import type { OpenAPIPath } from '../../type';
import { BillPath } from './bill';
import { DiscountCouponPath } from './discountCoupon';

export const WalletPath: OpenAPIPath = {
  ...BillPath,
  ...DiscountCouponPath
};
