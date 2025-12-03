import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  DiscountCouponStatusEnum,
  DiscountCouponTypeEnum
} from '../../../../support/wallet/discountCoupon/constants';

// 优惠券列表项 Schema
export const DiscountCouponItemSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '优惠券 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  type: z.nativeEnum(DiscountCouponTypeEnum).meta({ description: '优惠券类型' }),
  name: z.string().meta({ description: '优惠券名称' }),
  description: z.string().meta({ description: '优惠券描述' }),
  discount: z.number().meta({ description: '折扣率' }),
  iconZh: z.string().meta({ description: '中文图标路径' }),
  iconEn: z.string().meta({ description: '英文图标路径' }),
  status: z.nativeEnum(DiscountCouponStatusEnum).meta({ description: '优惠券状态' }),
  startTime: z.coerce.date().optional().meta({ description: '生效时间' }),
  expiredTime: z.coerce.date().meta({ description: '过期时间' }),
  usedAt: z.coerce.date().optional().meta({ description: '使用时间' }),
  billId: ObjectIdSchema.optional().meta({
    description: '关联的订单 ID'
  }),
  createTime: z.coerce.date().meta({ description: '创建时间' })
});

// 优惠券列表响应 Schema
export const DiscountCouponListResponseSchema = z.array(DiscountCouponItemSchema);

// 类型导出
export type DiscountCouponItemType = z.infer<typeof DiscountCouponItemSchema>;
export type DiscountCouponListResponseType = z.infer<typeof DiscountCouponListResponseSchema>;
