import z from 'zod';
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { BillTypeEnum, BillStatusEnum } from '../../../../support/wallet/bill/constants';

export const BillItemSchema = z.object({
  id: z.string().meta({ description: '订单ID' }),
  orderId: z.string().meta({ description: '订单号' }),
  type: z.enum(BillTypeEnum).meta({ description: '订单类型' }),
  status: z.enum(BillStatusEnum).meta({ description: '订单状态' }),
  price: z.number().meta({ description: '订单金额' }),
  username: z.string().meta({ description: '关联用户名' }),
  createTime: z.date().meta({ description: '创建时间' })
});

export const GetPaysBodySchema = PaginationSchema.extend({
  username: z.string().meta({ description: '搜索用户名' }),
  type: z.enum(BillTypeEnum).optional().meta({ description: '订单类型筛选' }),
  status: z.enum(BillStatusEnum).optional().meta({ description: '订单状态筛选' })
});
export const GetPaysResponseSchema = PaginationResponseSchema(BillItemSchema);
