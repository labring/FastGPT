import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  BillDetailQuerySchema,
  BillDetailResponseSchema,
  BillListQuerySchema,
  BillListResponseSchema,
  CancelBillPropsSchema,
  CheckPayResultQuerySchema,
  CheckPayResultResponseSchema,
  CreateBillPropsSchema,
  CreateBillResponseSchema,
  UpdateBillResponseSchema,
  UpdatePaymentPropsSchema
} from './api';

export const BillPath: OpenAPIPath = {
  '/proApi/support/wallet/bill/balanceConversion': {
    get: {
      summary: '转换账户余额',
      description: '将团队账户余额转换为额外积分，有效期为一年，仅团队所有者可以操作',
      tags: [DevApiTagsMap.walletBill],
      responses: {
        200: {
          description: '余额转换成功'
        }
      }
    }
  },
  '/proApi/support/wallet/bill/create': {
    post: {
      summary: '创建订单',
      description: '创建标准订阅套餐、额外积分或额外数据集存储订单',
      tags: [DevApiTagsMap.walletBill],
      requestBody: {
        content: { 'application/json': { schema: CreateBillPropsSchema } }
      },
      responses: {
        200: {
          description: '成功创建订单并返回支付信息',
          content: { 'application/json': { schema: CreateBillResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/pay/updatePayment': {
    put: {
      summary: '更新支付方式',
      description: '为未支付订单更新支付方式，并返回新的支付二维码或跳转链接',
      tags: [DevApiTagsMap.walletBill],
      requestBody: {
        content: { 'application/json': { schema: UpdatePaymentPropsSchema } }
      },
      responses: {
        200: {
          description: '成功更新支付方式',
          content: { 'application/json': { schema: UpdateBillResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/pay/checkPayResult': {
    get: {
      summary: '检查支付结果',
      description: '查询订单支付状态，用于轮询支付结果',
      tags: [DevApiTagsMap.walletBill],
      requestParams: { query: CheckPayResultQuerySchema },
      responses: {
        200: {
          description: '成功获取支付结果',
          content: { 'application/json': { schema: CheckPayResultResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/detail': {
    get: {
      summary: '获取订单详情',
      description: '根据订单 ID 获取订单详细信息，包括优惠券和发票状态',
      tags: [DevApiTagsMap.walletBill],
      requestParams: { query: BillDetailQuerySchema },
      responses: {
        200: {
          description: '成功获取订单详情；订单不存在时 data 为 null',
          content: { 'application/json': { schema: BillDetailResponseSchema.nullable() } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/list': {
    post: {
      summary: '获取订单列表',
      description: '分页获取当前团队订单列表，支持按订单类型筛选',
      tags: [DevApiTagsMap.walletBill],
      requestBody: {
        content: { 'application/json': { schema: BillListQuerySchema } }
      },
      responses: {
        200: {
          description: '成功获取订单列表',
          content: { 'application/json': { schema: BillListResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/bill/cancel': {
    post: {
      summary: '取消订单',
      description: '取消未支付订单；如果使用了优惠券，会同时返还优惠券',
      tags: [DevApiTagsMap.walletBill],
      requestBody: {
        content: { 'application/json': { schema: CancelBillPropsSchema } }
      },
      responses: {
        200: {
          description: '成功取消订单'
        }
      }
    }
  }
};
