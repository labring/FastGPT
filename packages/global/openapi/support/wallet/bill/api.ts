import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import { IntSchema, NumSchema } from '../../../../common/zod';
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
import { PaginationResponseSchema, PaginationSchema } from '../../../api';
import { CouponTypeEnum } from '../../../../support/wallet/sub/coupon/constants';

/* ============================================================================
 * API: 钱包订单相关接口
 * Route: /api/proApi/support/wallet/bill/*
 * Method: GET/POST/PUT
 * Description: 管理团队订单、支付方式、订单详情和余额转换。
 * Tags: ['订单']
 * ============================================================================ */

const BillMetadataSchema = z
  .object({
    payWay: z
      .enum(BillPayWayEnum)
      .optional()
      .meta({ example: BillPayWayEnum.wx, description: '支付方式' }),
    subMode: z
      .enum(SubModeEnum)
      .optional()
      .meta({ example: SubModeEnum.month, description: '订阅周期' }),
    standSubLevel: z.enum(StandardSubLevelEnum).optional().meta({
      example: StandardSubLevelEnum.basic,
      description: '标准套餐等级'
    }),
    month: NumSchema.nonnegative().optional().meta({ example: 1, description: '订阅月数' }),
    datasetSize: IntSchema.optional().meta({ example: 10, description: '数据集容量' }),
    extraPoints: IntSchema.optional().meta({ example: 10000, description: '额外积分数' }),
    activitySource: z
      .string()
      .optional()
      .meta({ example: 'enterpriseAuth', description: '活动来源' }),
    taskId: z.string().optional().meta({ example: 'task-123', description: '活动任务 ID' }),
    durationDay: IntSchema.optional().meta({ example: 30, description: '权益时长，单位天' }),
    totalPoints: IntSchema.optional().meta({ example: 10000, description: '权益积分数' }),
    grantedPlanCount: IntSchema.optional().meta({ example: 1, description: '赠送套餐数' })
  })
  .catchall(z.unknown())
  .meta({
    example: { payWay: BillPayWayEnum.wx, month: 1 },
    description: '订单业务元数据'
  });

/**
 * 钱包订单的客户端可见字段。该 schema 不直接复用数据库类型，因为数据库中
 * 仍存在历史字段和不同支付流程产生的可选字段，接口只声明实际对外返回的数据。
 */
export const BillItemSchema = z
  .object({
    _id: ObjectIdSchema.meta({ description: '订单 ID' }),
    teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
    tmbId: ObjectIdSchema.meta({ description: '创建订单的团队成员 ID' }),
    createTime: z.coerce.date().meta({
      example: '2026-01-01T00:00:00.000Z',
      description: '订单创建时间'
    }),
    orderId: z.string().meta({ example: 'a1b2c3d4e5f6g7h8i9j0', description: '订单号' }),
    status: z
      .enum(BillStatusEnum)
      .meta({ example: BillStatusEnum.SUCCESS, description: '订单状态' }),
    type: z
      .enum(BillTypeEnum)
      .meta({ example: BillTypeEnum.standSubPlan, description: '订单类型' }),
    price: NumSchema.meta({ example: 9900, description: '订单金额，单位为系统内部金额单位' }),
    couponId: ObjectIdSchema.optional().meta({
      example: '68ee0bd23d17260b7829b138',
      description: '使用的优惠券 ID'
    }),
    hasInvoice: z.boolean().optional().meta({ example: false, description: '是否已开具发票' }),
    // 2024-02 之前的历史充值订单未保存支付元数据，读取时统一兼容为空对象。
    metadata: BillMetadataSchema.default({}),
    paidAmount: NumSchema.optional().meta({ example: 99, description: '实际支付金额' }),
    refundData: z.record(z.string(), z.unknown()).optional().meta({
      description: '退款信息'
    })
  })
  .meta({ description: '钱包订单' });
export type BillItemType = z.infer<typeof BillItemSchema>;

// Bill list
export const BillListQuerySchema = PaginationSchema.extend({
  type: z.enum(BillTypeEnum).optional().meta({
    example: BillTypeEnum.standSubPlan,
    description: '订单类型筛选'
  })
}).meta({ description: '订单列表筛选和分页参数' });
export type GetBillListQueryType = z.infer<typeof BillListQuerySchema>;
export const BillListResponseSchema = PaginationResponseSchema(BillItemSchema).meta({
  description: '订单分页列表'
});
export type GetBillListResponseType = z.infer<typeof BillListResponseSchema>;

// Bill detail
export const BillDetailQuerySchema = z.object({
  billId: ObjectIdSchema.meta({
    example: '68ee0bd23d17260b7829b137',
    description: '订单 ID'
  })
});
export type BillDetailQueryType = z.infer<typeof BillDetailQuerySchema>;
export const BillDetailResponseSchema = BillItemSchema.extend({
  discountCouponName: z.string().optional().meta({
    example: 'common:old_user_month_discount_70',
    description: '优惠券名称'
  }),
  couponDetail: z
    .object({
      key: z.string().meta({ example: 'coupon-key', description: '兑换码' }),
      type: z
        .enum(CouponTypeEnum)
        .meta({ example: CouponTypeEnum.activity, description: '兑换码类型' }),
      subscriptions: z
        .array(
          z
            .object({
              type: z
                .enum(SubTypeEnum)
                .meta({ example: SubTypeEnum.standard, description: '权益类型' }),
              durationDay: IntSchema.meta({ example: 30, description: '权益时长，单位天' }),
              totalPoints: IntSchema.optional().meta({ example: 10000, description: '赠送积分数' }),
              level: z.enum(StandardSubLevelEnum).optional().meta({
                example: StandardSubLevelEnum.basic,
                description: '标准套餐等级'
              }),
              extraDatasetSize: IntSchema.optional().meta({
                example: 10,
                description: '额外数据集容量'
              }),
              customConfig: z.record(z.string(), z.any()).optional().meta({
                description: '自定义套餐配置'
              })
            })
            .meta({ description: '兑换码权益' })
        )
        .meta({ description: '兑换码权益列表' })
    })
    .optional()
    .meta({ description: '兑换码详情' })
}).meta({ description: '订单详情' });
export type BillDetailResponseType = z.infer<typeof BillDetailResponseSchema>;

// Create
export const CreateStandPlanBillSchema = z
  .object({
    type: z.literal(BillTypeEnum.standSubPlan).meta({
      example: BillTypeEnum.standSubPlan,
      description: '订单类型：标准订阅套餐'
    }),
    level: z.enum(StandardSubLevelEnum).meta({
      example: StandardSubLevelEnum.basic,
      description: '标准订阅等级'
    }),
    subMode: z.enum(SubModeEnum).meta({ example: SubModeEnum.month, description: '订阅周期' }),
    discountCouponId: ObjectIdSchema.optional().meta({
      example: '68ee0bd23d17260b7829b138',
      description: '优惠券 ID'
    })
  })
  .meta({ description: '标准订阅套餐订单创建参数' });
export const CreateExtractPointsBillSchema = z
  .object({
    type: z.literal(BillTypeEnum.extraPoints).meta({
      example: BillTypeEnum.extraPoints,
      description: '订单类型：额外积分'
    }),
    extraPoints: IntSchema.meta({ example: 10000, description: '额外积分数量' }),
    month: IntSchema.min(1).max(12).meta({ example: 1, description: '订阅月数' }),
    discountCouponId: ObjectIdSchema.optional().meta({
      example: '68ee0bd23d17260b7829b138',
      description: '优惠券 ID，当前额外积分订单暂不使用'
    })
  })
  .meta({ description: '额外积分订单创建参数' });
export const CreateExtractDatasetBillSchema = z
  .object({
    type: z.literal(BillTypeEnum.extraDatasetSub).meta({
      example: BillTypeEnum.extraDatasetSub,
      description: '订单类型：额外数据集存储'
    }),
    extraDatasetSize: IntSchema.meta({ example: 10, description: '额外数据集大小' }),
    month: IntSchema.min(1).max(12).meta({ example: 1, description: '订阅月数' }),
    discountCouponId: ObjectIdSchema.optional().meta({
      example: '68ee0bd23d17260b7829b138',
      description: '优惠券 ID，当前额外数据集订单暂不使用'
    })
  })
  .meta({ description: '额外数据集存储订单创建参数' });
export const CreateBillPropsSchema = z
  .union([CreateStandPlanBillSchema, CreateExtractPointsBillSchema, CreateExtractDatasetBillSchema])
  .meta({ description: '订单创建参数' });
export type CreateBillPropsType = z.infer<typeof CreateBillPropsSchema>;

export const UpdatePaymentPropsSchema = z.object({
  billId: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b137', description: '订单 ID' }),
  payWay: z.enum(BillPayWayEnum).meta({ example: BillPayWayEnum.wx, description: '支付方式' })
});
export type UpdatePaymentPropsType = z.infer<typeof UpdatePaymentPropsSchema>;

export const UpdateBillResponseSchema = z
  .object({
    qrCode: z.string().optional().meta({ description: '支付二维码 URL' }),
    iframeCode: z.string().optional().meta({ description: '支付 iframe 代码' }),
    markdown: z.string().optional().meta({ description: 'Markdown 格式的支付信息' }),
    payUrl: z.string().optional().meta({ description: '支付跳转 URL' }),
    metadata: z
      .record(z.string(), z.unknown())
      .nullish()
      .meta({
        example: { payWay: BillPayWayEnum.wx },
        description: '支付元数据'
      })
  })
  .refine((data) => data.qrCode || data.iframeCode || data.markdown || data.payUrl, {
    message: 'At least one of qrCode, iframeCode, markdown, or payUrl must be provided'
  });
export type UpdateBillResponseType = z.infer<typeof UpdateBillResponseSchema>;

export const CreateBillResponseSchema = UpdateBillResponseSchema.safeExtend({
  billId: ObjectIdSchema.optional().meta({
    example: '68ee0bd23d17260b7829b137',
    description: '订单 ID，企微支付时为空'
  }),
  readPrice: NumSchema.min(0).meta({ example: 99, description: '实际支付价格' }),
  payment: z.enum(BillPayWayEnum).meta({ example: BillPayWayEnum.wx, description: '支付方式' })
}).meta({ description: '创建订单响应' });
export type CreateBillResponseType = z.infer<typeof CreateBillResponseSchema>;

// Check pay result
export const CheckPayResultResponseSchema = z.object({
  status: z.enum(BillStatusEnum).meta({ example: BillStatusEnum.NOTPAY, description: '支付状态' }),
  description: z.string().optional().meta({ description: '支付状态说明' })
});
export type CheckPayResultResponseType = z.infer<typeof CheckPayResultResponseSchema>;

// Cancel bill
export const CancelBillPropsSchema = z.object({
  billId: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b137', description: '订单 ID' })
});
export type CancelBillPropsType = z.infer<typeof CancelBillPropsSchema>;

// Check pay result
export const CheckPayResultQuerySchema = z.object({
  payId: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b137', description: '订单 ID' })
});
export type CheckPayResultQueryType = z.infer<typeof CheckPayResultQuerySchema>;
