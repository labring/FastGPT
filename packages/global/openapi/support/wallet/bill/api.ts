import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  BillTypeEnum,
  BillStatusEnum,
  BillPayWayEnum
} from '../../../../support/wallet/bill/constants';
import { StandardSubLevelEnum, SubModeEnum } from '../../../../support/wallet/sub/constants';

// 创建订单请求 Schema
export const CreateStandPlanBillSchema = z.object({
  type: z.literal(BillTypeEnum.standSubPlan).meta({ description: '订单类型：标准订阅套餐' }),
  level: z.nativeEnum(StandardSubLevelEnum).meta({ description: '标准订阅等级' }),
  subMode: z.nativeEnum(SubModeEnum).meta({ description: '订阅周期' }),
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

// 创建订单响应 Schema
export const CreateOrderResponseSchema = z.object({
  qrCode: z.string().optional().meta({ description: '支付二维码 URL' }),
  iframeCode: z.string().optional().meta({ description: '支付 iframe 代码' }),
  markdown: z.string().optional().meta({ description: 'Markdown 格式的支付信息' })
});

// 创建订单响应 Schema
export const CreateBillResponseSchema = CreateOrderResponseSchema.extend({
  billId: z.string().meta({ description: '订单 ID' }),
  readPrice: z.number().meta({ description: '实际支付价格' }),
  payment: z.nativeEnum(BillPayWayEnum).meta({ description: '支付方式' })
});

// 更新支付方式请求 Schema
export const UpdatePaymentPropsSchema = z.object({
  billId: ObjectIdSchema.meta({ description: '订单 ID' }),
  payWay: z.nativeEnum(BillPayWayEnum).meta({ description: '新的支付方式' })
});

// 检查支付结果响应 Schema
export const CheckPayResultResponseSchema = z.object({
  status: z.nativeEnum(BillStatusEnum).meta({ description: '支付状态' }),
  description: z.string().optional().meta({ description: '状态描述' })
});

// 订单详情响应 Schema（基于 BillSchemaType）
export const BillDetailResponseSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '订单 ID' }),
  userId: ObjectIdSchema.meta({ description: '用户 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  tmbId: ObjectIdSchema.meta({ description: '团队成员 ID' }),
  createTime: z.coerce.date().meta({ description: '创建时间' }),
  orderId: z.string().meta({ description: '订单 ID' }),
  status: z.nativeEnum(BillStatusEnum).meta({ description: '订单状态' }),
  type: z.nativeEnum(BillTypeEnum).meta({ description: '订单类型' }),
  price: z.number().meta({ description: '价格（分）' }),
  couponId: ObjectIdSchema.optional().meta({
    description: '优惠券 ID'
  }),
  hasInvoice: z.boolean().meta({ description: '是否已开发票' }),
  metadata: z
    .object({
      payWay: z.nativeEnum(BillPayWayEnum).meta({ description: '支付方式' }),
      subMode: z.nativeEnum(SubModeEnum).optional().meta({ description: '订阅周期' }),
      standSubLevel: z
        .nativeEnum(StandardSubLevelEnum)
        .optional()
        .meta({ description: '订阅等级' }),
      month: z.number().optional().meta({ description: '月数' }),
      datasetSize: z.number().optional().meta({ description: '数据集大小' }),
      extraPoints: z.number().optional().meta({ description: '额外积分' })
    })
    .meta({ description: '元数据' }),
  refundData: z
    .object({
      amount: z.number().meta({ description: '退款金额' }),
      refundId: z.string().meta({ description: '退款 ID' }),
      refundTime: z.coerce.date().meta({ description: '退款时间' })
    })
    .optional()
    .meta({ description: '退款数据' }),
  couponName: z.string().optional().meta({ description: '优惠券名称' })
});

// 订单列表请求 Schema
export const BillListQuerySchema = z.object({
  type: z.nativeEnum(BillTypeEnum).optional().meta({ description: '订单类型筛选' }),
  offset: z.coerce.number().optional().meta({ description: '偏移量' }),
  pageSize: z.coerce.number().optional().meta({ description: '每页数量' })
});

// 取消订单请求 Schema
export const CancelBillPropsSchema = z.object({
  billId: ObjectIdSchema.meta({ description: '订单 ID' })
});
