import type { OpenAPIPath } from '../../../type';
import { DiscountCouponListQuerySchema, DiscountCouponListResponseSchema } from './api';
import { DevApiTagsMap } from '../../../tag';

export const DiscountCouponPath: OpenAPIPath = {
  '/proApi/support/wallet/discountCoupon/list': {
    get: {
      summary: '获取优惠券列表',
      description: '获取团队的优惠券列表，包括优惠券状态、使用情况等信息',
      tags: [DevApiTagsMap.walletDiscountCoupon],
      requestParams: { query: DiscountCouponListQuerySchema },
      responses: {
        200: {
          description: '成功获取优惠券列表',
          content: {
            'application/json': {
              schema: DiscountCouponListResponseSchema
            }
          }
        }
      }
    }
  }
};
