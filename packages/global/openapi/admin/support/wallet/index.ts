import type { OpenAPIPath } from '../../../type';
import { AdminCouponPath } from './coupon';
import { AdminBillPath } from './bill';

export const AdminWalletPath: OpenAPIPath = {
  ...AdminCouponPath,
  ...AdminBillPath
};
