import type { OpenAPIPath } from '../../type';
import { AdminBillPath } from './bill';
import { AdminCouponPath } from './coupon';
import { AdminPayPath } from './pay';
import { AdminPlanPath } from './plan';

export const AdminWalletPath: OpenAPIPath = {
  ...AdminPayPath,
  ...AdminPlanPath,
  ...AdminBillPath,
  ...AdminCouponPath
};
