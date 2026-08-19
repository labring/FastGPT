import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { RedeemCouponQuerySchema, RedeemCouponResponseSchema } from './api';

export const CouponPath: OpenAPIPath = {
  '/proApi/support/wallet/coupon/redeem': {
    get: {
      summary: '兑换兑换码',
      description: '使用团队兑换码兑换订阅、积分或数据集容量',
      tags: [DevApiTagsMap.walletDiscountCoupon],
      requestParams: { query: RedeemCouponQuerySchema },
      responses: {
        200: {
          description: '兑换成功',
          content: { 'application/json': { schema: RedeemCouponResponseSchema } }
        }
      }
    }
  }
};
