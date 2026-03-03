import { GET } from '@/web/common/api/request';
import type { DiscountCouponListResponseType } from '@fastgpt/global/openapi/support/wallet/discountCoupon/api';

export const getDiscountCouponList = (teamId: string) =>
  GET<DiscountCouponListResponseType>(`/proApi/support/wallet/discountCoupon/list`, { teamId });
