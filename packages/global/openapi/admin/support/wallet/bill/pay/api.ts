import z from 'zod';
import { NumSchema } from '../../../../../../common/zod';

export const RefundBodySchema = z.object({
  amount: NumSchema.positive().meta({ description: '退款金额' }),
  orderId: z.string().min(1).meta({ description: '订单号' })
});

export const RefundResponseSchema = z.object({
  message: z.string().meta({ description: '退款结果消息' })
});
