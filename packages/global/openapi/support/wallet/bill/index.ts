import { z } from 'zod';
import type { OpenAPIPath } from '../../../type';
import {
  CreateBillPropsSchema,
  CreateBillResponseSchema,
  UpdatePaymentPropsSchema,
  UpdateBillResponseSchema,
  CheckPayResultResponseSchema,
  BillDetailResponseSchema,
  BillListQuerySchema,
  CancelBillPropsSchema,
  CheckPayResultQuerySchema,
  BillDetailQuerySchema
} from './api';
import { TagsMap } from '../../../tag';
import { ObjectIdSchema } from '../../../../common/type/mongo';

export const BillPath: OpenAPIPath = {
  '/support/wallet/bill/create': {
    post: {
      summary: '创建订单',
      description: '创建订单订单，支持标准订阅套餐、额外积分、额外数据集存储三种类型',
      tags: [TagsMap.walletBill],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateBillPropsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建订单',
          content: {
            'application/json': {
              schema: CreateBillResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/wallet/bill/pay/updatePayment': {
    post: {
      summary: '更新支付方式',
      description: '为未支付的订单更新支付方式，返回新的支付二维码或链接',
      tags: [TagsMap.walletBill],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdatePaymentPropsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新支付方式',
          content: {
            'application/json': {
              schema: UpdateBillResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/wallet/bill/pay/checkPayResult': {
    get: {
      summary: '检查支付结果',
      description: '检查订单的支付状态，用于轮询支付结果',
      tags: [TagsMap.walletBill],
      requestParams: {
        query: CheckPayResultQuerySchema
      },
      responses: {
        200: {
          description: '成功获取支付结果',
          content: {
            'application/json': {
              schema: CheckPayResultResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/wallet/bill/detail': {
    get: {
      summary: '获取订单详情',
      description: '根据订单 ID 获取订单详细信息，包括优惠券名称等',
      tags: [TagsMap.walletBill],
      requestParams: {
        query: BillDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功获取订单详情',
          content: {
            'application/json': {
              schema: BillDetailResponseSchema.nullable()
            }
          }
        }
      }
    }
  },
  '/support/wallet/bill/list': {
    post: {
      summary: '获取订单列表',
      description: '分页获取团队的订单列表，支持按类型筛选',
      tags: [TagsMap.walletBill],
      requestBody: {
        content: {
          'application/json': {
            schema: BillListQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取订单列表',
          content: {
            'application/json': {
              schema: z.object({
                list: z.array(BillDetailResponseSchema),
                total: z.number().meta({ description: '总数' })
              })
            }
          }
        }
      }
    }
  },
  '/support/wallet/bill/cancel': {
    post: {
      summary: '取消订单',
      description: '取消未支付的订单，如果使用了优惠券会自动返还',
      tags: [TagsMap.walletBill],
      requestBody: {
        content: {
          'application/json': {
            schema: CancelBillPropsSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功取消订单',
          content: {
            'application/json': {
              schema: z.null()
            }
          }
        }
      }
    }
  }
};
