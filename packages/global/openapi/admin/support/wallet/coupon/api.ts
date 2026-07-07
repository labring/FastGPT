import z from 'zod';
import { IntSchema, NumSchema } from '../../../../../common/zod';
import { CouponTypeEnum } from '../../../../../support/wallet/sub/coupon/constants';
import { StandardSubLevelEnum, SubTypeEnum } from '../../../../../support/wallet/sub/constants';

export const CreateCouponSubscriptionSchema = z.object({
  type: z.enum(SubTypeEnum).meta({
    description: '套餐类型',
    example: SubTypeEnum.standard
  }),
  durationDay: NumSchema.positive().meta({
    description: '套餐有效天数',
    example: 30
  }),
  level: z.enum(StandardSubLevelEnum).optional().meta({
    description: '标准套餐等级，仅标准套餐需要',
    example: StandardSubLevelEnum.basic
  }),
  extraDatasetSize: NumSchema.nonnegative().optional().meta({
    description: '额外数据集容量',
    example: 1000
  }),
  totalPoints: NumSchema.nonnegative().optional().meta({
    description: '额外积分或套餐积分',
    example: 5000
  }),
  customConfig: z.any().optional().meta({
    description: '自定义套餐配置'
  })
});
export type CreateCouponSubscriptionType = z.infer<typeof CreateCouponSubscriptionSchema>;

export const CreateCouponBodySchema = z.object({
  subscriptions: z.array(CreateCouponSubscriptionSchema).min(1).meta({
    description: '兑换码包含的套餐列表'
  }),
  count: IntSchema.positive().optional().default(1).meta({
    description: '生成兑换码数量',
    example: 1
  }),
  type: z.enum(CouponTypeEnum).meta({
    description: '兑换码类型',
    example: CouponTypeEnum.activity
  }),
  price: NumSchema.nonnegative().optional().meta({
    description: '订单原价',
    example: 100
  }),
  paidAmount: NumSchema.nonnegative().optional().meta({
    description: '实付金额',
    example: 80
  }),
  transactionId: z.string().trim().optional().meta({
    description: '线下交易流水号',
    example: 'TXN20260324001'
  }),
  description: z.string().optional().meta({
    description: '兑换码说明',
    example: '线下付款兑换码'
  })
});
export type CreateCouponBodyType = z.infer<typeof CreateCouponBodySchema>;

export const CreateCouponResponseSchema = z
  .array(
    z.string().meta({
      description: '兑换码',
      example: 'AbCdEfGhIjKlMnOpQrStUvWx'
    })
  )
  .meta({
    description: '生成的兑换码列表'
  });
export type CreateCouponResponseType = z.infer<typeof CreateCouponResponseSchema>;

export const ListCouponItemSchema = z.object({
  key: z.string().meta({
    description: '兑换码',
    example: 'AbCdEfGhIjKlMnOpQrStUvWx'
  }),
  subscriptions: z.array(CreateCouponSubscriptionSchema).meta({
    description: '兑换码包含的套餐列表'
  }),
  expiredAt: z.coerce.date().meta({
    description: '过期时间',
    example: '2026-03-24T00:00:00.000Z'
  })
});
export const ListCouponResponseSchema = z.array(ListCouponItemSchema).meta({
  description: '未过期且未使用的兑换码列表'
});
export type ListCouponResponseType = z.infer<typeof ListCouponResponseSchema>;

export const DisableCouponBodySchema = z.object({
  keys: z
    .array(z.string().min(1))
    .min(1)
    .meta({
      description: '需要禁用的兑换码列表',
      example: ['AbCdEfGhIjKlMnOpQrStUvWx']
    })
});
export type DisableCouponBodyType = z.infer<typeof DisableCouponBodySchema>;

export const DisableCouponResponseSchema = z.undefined().meta({
  description: '操作成功'
});
export type DisableCouponResponseType = z.infer<typeof DisableCouponResponseSchema>;
