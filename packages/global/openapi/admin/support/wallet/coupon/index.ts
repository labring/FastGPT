import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  CreateCouponBodySchema,
  CreateCouponResponseSchema,
  DisableCouponBodySchema,
  DisableCouponResponseSchema,
  ListCouponResponseSchema
} from './api';

export const AdminCouponPath: OpenAPIPath = {
  '/admin/support/wallet/coupon/create': {
    post: {
      summary: '创建兑换码',
      description: '管理员创建一个或多个订阅兑换码，可用于活动赠送或线下付款兑换',
      tags: [DevApiTagsMap.adminWalletCoupon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateCouponBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '创建成功，返回生成的兑换码列表',
          content: {
            'application/json': {
              schema: CreateCouponResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/support/wallet/coupon/list': {
    get: {
      summary: '获取兑换码列表',
      description: '管理员获取未过期且未使用的兑换码列表',
      tags: [DevApiTagsMap.adminWalletCoupon],
      responses: {
        200: {
          description: '成功获取兑换码列表',
          content: {
            'application/json': {
              schema: ListCouponResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/support/wallet/coupon/disable': {
    post: {
      summary: '禁用兑换码',
      description: '管理员将指定兑换码设置为已过期',
      tags: [DevApiTagsMap.adminWalletCoupon],
      requestBody: {
        content: {
          'application/json': {
            schema: DisableCouponBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '禁用成功',
          content: {
            'application/json': {
              schema: DisableCouponResponseSchema
            }
          }
        }
      }
    }
  }
};
