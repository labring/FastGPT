import type { OpenAPIPath } from '../../../../../type';
import { DevApiTagsMap } from '../../../../../tag';
import { RefundBodySchema, RefundResponseSchema } from './api';

export const AdminRefundPath: OpenAPIPath = {
  '/admin/support/wallet/bill/pay/refund': {
    post: {
      summary: '订单退款',
      description: '管理员对已支付订单进行退款操作',
      tags: [DevApiTagsMap.adminWalletRefund],
      requestBody: {
        content: {
          'application/json': {
            schema: RefundBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '退款操作结果',
          content: {
            'application/json': {
              schema: RefundResponseSchema
            }
          }
        }
      }
    }
  }
};
