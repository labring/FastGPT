import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  BillTypeEnum,
  BillStatusEnum,
  BillPayWayEnum
} from '../../../../support/wallet/bill/constants';
import { StandardSubLevelEnum, SubModeEnum } from '../../../../support/wallet/sub/constants';
import { BillSchema } from '../../../../support/wallet/bill/type';
import { PaginationSchema } from '../../../api';

export const BillListQuerySchema = PaginationSchema.extend({
  type: z.enum(Object.values(BillTypeEnum)).optional().meta({ description: '订单类型筛选' })
});
export type GetBillListQueryType = z.infer<typeof BillListQuerySchema>;

export const BillListResponseSchema = z.object({
  total: z.number(),
  list: z.array(BillSchema)
});
export type GetBillListResponseType = z.infer<typeof BillListResponseSchema>;

export const CreateStandPlanBillSchema = z.object({
  type: z.literal(BillTypeEnum.standSubPlan).meta({ description: '订单类型：标准订阅套餐' }),
  level: z.enum(Object.values(StandardSubLevelEnum)).meta({ description: '标准订阅等级' }),
  subMode: z.enum(Object.values(SubModeEnum)).meta({ description: '订阅周期' }),
  discountCouponId: z.string().optional().meta({ description: '优惠券 ID' })
});
export const CreateExtractPointsBillSchema = z.object({
  type: z.literal(BillTypeEnum.extraPoints).meta({ description: '订单类型：额外积分' }),
  extraPoints: z.number().meta({ description: '额外积分数量' }),
  duration: z.number().meta({ description: '有效期（月）' }),
  discountCouponId: z.string().optional().meta({ description: '优惠券 ID（未使用）' })
});
export const CreateExtractDatasetBillSchema = z.object({
  type: z.literal(BillTypeEnum.extraDatasetSub).meta({ description: '订单类型：额外数据集存储' }),
  extraDatasetSize: z.number().meta({ description: '额外数据集大小' }),
  month: z.number().meta({ description: '订阅月数' }),
  discountCouponId: z.string().optional().meta({ description: '优惠券 ID（未使用）' })
});
export const CreateBillPropsSchema = z.discriminatedUnion('type', [
  CreateStandPlanBillSchema,
  CreateExtractPointsBillSchema,
  CreateExtractDatasetBillSchema
]);
export type CreateBillPropsType = z.infer<typeof CreateBillPropsSchema>;

export const CreateOrderResponseSchema = z.object({
  qrCode: z.string().optional().meta({ description: '支付二维码 URL' }),
  iframeCode: z.string().optional().meta({ description: '支付 iframe 代码' }),
  markdown: z.string().optional().meta({ description: 'Markdown 格式的支付信息' })
});
export type CreateOrderResponseType = z.infer<typeof CreateOrderResponseSchema>;
export const CreateBillResponseSchema = CreateOrderResponseSchema.extend({
  billId: z.string().meta({ description: '订单 ID' }),
  readPrice: z.number().meta({ description: '实际支付价格' }),
  payment: z.enum(Object.values(BillPayWayEnum)).meta({ description: '支付方式' })
});
export type CreateBillResponseType = z.infer<typeof CreateBillResponseSchema>;

export const CheckPayResultResponseSchema = z.object({
  status: z.enum(Object.values(BillStatusEnum)),
  description: z.string().optional()
});
export type CheckPayResultResponseType = z.infer<typeof CheckPayResultResponseSchema>;

export const UpdatePaymentPropsSchema = z.object({
  billId: ObjectIdSchema,
  payWay: z.enum(Object.values(BillPayWayEnum))
});
export type UpdatePaymentPropsType = z.infer<typeof UpdatePaymentPropsSchema>;

export const BillDetailResponseSchema = BillSchema.extend({
  couponName: z.string().optional()
});
export type BillDetailResponseType = z.infer<typeof BillDetailResponseSchema>;

export const CancelBillPropsSchema = z.object({
  billId: ObjectIdSchema.meta({ description: '订单 ID' })
});
export type CancelBillPropsType = z.infer<typeof CancelBillPropsSchema>;
