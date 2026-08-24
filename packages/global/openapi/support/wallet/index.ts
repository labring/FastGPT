import type { OpenAPIPath } from '../../type';
import { BillPath } from './bill';
import { WalletInvoicePath } from './bill/invoice';
import { DiscountCouponPath } from './discountCoupon';
import { CouponPath } from './coupon';
import { WalletUsagePath } from './usage';

export const WalletPath: OpenAPIPath = {
  ...BillPath,
  ...WalletInvoicePath,
  ...DiscountCouponPath,
  ...CouponPath,
  ...WalletUsagePath
};
