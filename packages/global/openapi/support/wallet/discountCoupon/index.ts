import type { OpenAPIPath } from '../../../type';
import { DiscountCouponListResponseSchema } from './api';
import { TagsMap } from '../../../tag';

export const DiscountCouponPath: OpenAPIPath = {
  '/support/wallet/discountCoupon/list': {
    get: {
      summary: '获取优惠券列表',
      description: '获取团队的优惠券列表，包括优惠券状态、使用情况等信息',
      tags: [TagsMap.walletDiscountCoupon],
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
