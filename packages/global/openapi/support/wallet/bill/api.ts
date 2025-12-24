import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  BillTypeEnum,
  BillStatusEnum,
  BillPayWayEnum
} from '../../../../support/wallet/bill/constants';
import {
  StandardSubLevelEnum,
  SubModeEnum,
  SubTypeEnum
} from '../../../../support/wallet/sub/constants';
import { PaginationSchema } from '../../../api';
import { BillSchema } from '../../../../support/wallet/bill/type';
import { CouponTypeEnum } from '../../../../support/wallet/sub/coupon/constants';

// Bill list
export const BillListQuerySchema = PaginationSchema.safeExtend({
  type: z.enum(BillTypeEnum).optional().meta({ description: '订单类型筛选' })
});
export type GetBillListQueryType = z.infer<typeof BillListQuerySchema>;
export const BillListResponseSchema = z.object({
  total: z.number(),
  list: z.array(BillSchema)
});
export type GetBillListResponseType = z.infer<typeof BillListResponseSchema>;

// Bill detail
export const BillDetailQuerySchema = z.object({
  billId: ObjectIdSchema.meta({ description: '订单 ID' })
});
export type BillDetailQueryType = z.infer<typeof BillDetailQuerySchema>;
export const BillDetailResponseSchema = BillSchema.safeExtend({
  discountCouponName: z.string().optional(),
  couponDetail: z
    .object({
      key: z.string(),
      type: z.enum(CouponTypeEnum),
      subscriptions: z.array(
        z.object({
          type: z.enum(SubTypeEnum),
          durationDay: z.number(),
          totalPoints: z.number().optional(),
          level: z.enum(StandardSubLevelEnum).optional(),
          extraDatasetSize: z.number().optional(),
          customConfig: z.record(z.string(), z.any()).optional()
        })
      )
    })
    .optional()
});
export type BillDetailResponseType = z.infer<typeof BillDetailResponseSchema>;

// Create
export const CreateStandPlanBillSchema = z
  .object({
    type: z.literal(BillTypeEnum.standSubPlan).meta({ description: '订单类型：标准订阅套餐' }),
    level: z.enum(StandardSubLevelEnum).meta({ description: '标准订阅等级' }),
    subMode: z.enum(SubModeEnum).meta({ description: '订阅周期' }),
    discountCouponId: z.string().optional().meta({ description: '优惠券 ID' })
  })
  .meta({ description: '标准订阅套餐订单创建参数' });
export const CreateExtractPointsBillSchema = z
  .object({
    type: z.literal(BillTypeEnum.extraPoints).meta({ description: '订单类型：额外积分' }),
    extraPoints: z.int().min(0).meta({ description: '额外积分数量' }),
    month: z.int().min(1).max(12).meta({ description: '订阅月数' }),
    discountCouponId: z.string().optional().meta({ description: '优惠券 ID（未使用）' })
  })
  .meta({ description: '额外积分订单创建参数' });
export const CreateExtractDatasetBillSchema = z
  .object({
    type: z.literal(BillTypeEnum.extraDatasetSub).meta({ description: '订单类型：额外数据集存储' }),
    extraDatasetSize: z.int().min(0).meta({ description: '额外数据集大小' }),
    month: z.int().min(1).max(12).meta({ description: '订阅月数' }),
    discountCouponId: z.string().optional().meta({ description: '优惠券 ID（未使用）' })
  })
  .meta({ description: '额外数据集存储订单创建参数' });
export const CreateBillPropsSchema = z.discriminatedUnion('type', [
  CreateStandPlanBillSchema,
  CreateExtractPointsBillSchema,
  CreateExtractDatasetBillSchema
]);
export type CreateBillPropsType = z.infer<typeof CreateBillPropsSchema>;

export const UpdatePaymentPropsSchema = z.object({
  billId: ObjectIdSchema,
  payWay: z.enum(BillPayWayEnum)
});
export type UpdatePaymentPropsType = z.infer<typeof UpdatePaymentPropsSchema>;

export const UpdateBillResponseSchema = z
  .object({
    qrCode: z.string().optional().meta({ description: '支付二维码 URL' }),
    iframeCode: z.string().optional().meta({ description: '支付 iframe 代码' }),
    markdown: z.string().optional().meta({ description: 'Markdown 格式的支付信息' })
  })
  .refine((data) => data.qrCode || data.iframeCode || data.markdown, {
    message: 'At least one of qrCode, iframeCode, or markdown must be provided'
  });
export type UpdateBillResponseType = z.infer<typeof UpdateBillResponseSchema>;

export const CreateBillResponseSchema = UpdateBillResponseSchema.safeExtend({
  billId: z.string().meta({ description: '订单 ID' }),
  readPrice: z.number().min(0).meta({ description: '实际支付价格' }),
  payment: z.enum(BillPayWayEnum).meta({ description: '支付方式' })
});
export type CreateBillResponseType = z.infer<typeof CreateBillResponseSchema>;

// Check pay result
export const CheckPayResultResponseSchema = z.object({
  status: z.enum(BillStatusEnum),
  description: z.string().optional()
});
export type CheckPayResultResponseType = z.infer<typeof CheckPayResultResponseSchema>;

// Cancel bill
export const CancelBillPropsSchema = z.object({
  billId: ObjectIdSchema.meta({ description: '订单 ID' })
});
export type CancelBillPropsType = z.infer<typeof CancelBillPropsSchema>;

// Check pay result
export const CheckPayResultQuerySchema = z.object({
  payId: ObjectIdSchema.meta({ description: '订单 ID' })
});
export type CheckPayResultQueryType = z.infer<typeof CheckPayResultQuerySchema>;
