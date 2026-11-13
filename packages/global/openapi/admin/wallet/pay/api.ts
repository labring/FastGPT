import z from 'zod';
import { PaginationResponseSchema, createPaginationSchema } from '../../../api';
import { BillTypeEnum, BillStatusEnum } from '../../../../support/wallet/bill/constants';
import { BillSchema } from '../../../../support/wallet/bill/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { optionalEmptyToUndefined } from '../../../../common/zod';

/* ============================================================================
 * API: 获取支付记录
 * Route: POST /proApi/admin/wallet/pay/getPays
 * Method: POST
 * Description: 分页获取支付记录，支持按支付成员用户名、团队名称模糊搜索，团队ID精确搜索，以及订单类型和状态筛选
 * Tags: ['Admin', 'Pays', 'Read']
 * ============================================================================ */

export const BillItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '订单 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '支付成员 ID' }),
  orderId: z.string().meta({ description: '订单号' }),
  type: z.enum(BillTypeEnum).meta({ description: '订单类型' }),
  status: z.enum(BillStatusEnum).meta({ description: '订单状态' }),
  price: z.number().meta({ description: '订单金额' }),
  username: z.string().meta({ description: '支付成员用户名' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  couponId: BillSchema.shape.couponId,
  hasInvoice: BillSchema.shape.hasInvoice,
  paidAmount: BillSchema.shape.paidAmount,
  metadata: BillSchema.shape.metadata.partial().passthrough(),
  refundData: BillSchema.shape.refundData
});
export type BillItemType = z.infer<typeof BillItemSchema>;

export const GetPaysBodySchema = createPaginationSchema({
  username: z
    .string()
    .trim()
    .max(100)
    .optional()
    .meta({ description: '下单支付人用户名（模糊匹配）' }),
  teamName: z.string().trim().max(100).optional().meta({ description: '团队名称（模糊匹配）' }),
  teamId: optionalEmptyToUndefined(ObjectIdSchema).meta({ description: '团队ID（精确匹配）' }),
  type: z.enum(BillTypeEnum).optional().meta({ description: '订单类型筛选' }),
  status: z.enum(BillStatusEnum).optional().meta({ description: '订单状态筛选' })
});
export type GetPaysBodyType = z.infer<typeof GetPaysBodySchema>;

export const GetPaysResponseSchema = PaginationResponseSchema(BillItemSchema);
export type GetPaysResponseType = z.infer<typeof GetPaysResponseSchema>;
