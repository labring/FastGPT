import z from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  DiscountCouponStatusEnum,
  DiscountCouponTypeEnum
} from '../../../../support/wallet/sub/discountCoupon/constants';

/* ============================================================================
 * API: 获取优惠券列表
 * Route: GET /api/proApi/support/wallet/discountCoupon/list
 * Method: GET
 * Description: 获取当前团队的优惠券及其使用状态。
 * Tags: ['优惠券']
 * ============================================================================ */

export const DiscountCouponListQuerySchema = z.object({
  teamId: ObjectIdSchema.optional().meta({
    example: '68ee0bd23d17260b7829b137',
    description: '旧版调用传入的团队 ID；服务端始终以当前登录团队为准',
    deprecated: true
  })
});
export type DiscountCouponListQueryType = z.infer<typeof DiscountCouponListQuerySchema>;

export const DiscountCouponSchema = z.object({
  _id: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b139', description: '优惠券 ID' }),
  teamId: ObjectIdSchema.meta({ example: '68ee0bd23d17260b7829b137', description: '团队 ID' }),
  type: z.enum(Object.values(DiscountCouponTypeEnum)).meta({
    example: DiscountCouponTypeEnum.monthStandardDiscount70,
    description: '优惠券类型'
  }),
  startTime: z.coerce.date().optional().meta({
    example: '2026-01-01T00:00:00.000Z',
    description: '生效时间'
  }),
  expiredTime: z.coerce.date().meta({
    example: '2026-02-01T00:00:00.000Z',
    description: '过期时间'
  }),
  usedAt: z.coerce.date().optional().meta({
    example: '2026-01-10T00:00:00.000Z',
    description: '使用时间'
  }),
  createTime: z.coerce.date().meta({
    example: '2026-01-01T00:00:00.000Z',
    description: '创建时间'
  })
});

export type DiscountCouponSchemaType = z.infer<typeof DiscountCouponSchema>;

export const DiscountCouponItemSchema = DiscountCouponSchema.extend({
  name: z.string().meta({ example: '月度订阅 7 折', description: '优惠券名称' }),
  description: z.string().meta({ example: '月度标准套餐折扣', description: '优惠券描述' }),
  discount: z.number().min(0).max(1).meta({ example: 0.7, description: '折扣率' }),
  iconZh: z
    .string()
    .meta({ example: '/imgs/system/discount70CN.svg', description: '中文图标路径' }),
  iconEn: z
    .string()
    .meta({ example: '/imgs/system/discount70EN.svg', description: '英文图标路径' }),
  status: z.enum(DiscountCouponStatusEnum).meta({
    example: DiscountCouponStatusEnum.active,
    description: '优惠券状态'
  }),
  billId: ObjectIdSchema.optional().meta({
    example: '68ee0bd23d17260b7829b140',
    description: '关联的订单 ID，被使用后该值存在'
  })
});
export const DiscountCouponListResponseSchema = z
  .array(DiscountCouponItemSchema)
  .meta({ description: '优惠券列表' });

export type DiscountCouponListResponseType = z.infer<typeof DiscountCouponListResponseSchema>;
