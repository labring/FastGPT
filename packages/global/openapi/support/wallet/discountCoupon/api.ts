import { z } from 'zod';
import { ObjectIdSchema } from '../../../../common/type/mongo';
import {
  DiscountCouponStatusEnum,
  DiscountCouponTypeEnum
} from '../../../../support/wallet/sub/discountCoupon/constants';

export const DiscountCouponSchema = z.object({
  _id: ObjectIdSchema.meta({ description: '优惠券 ID' }),
  teamId: ObjectIdSchema.meta({ description: '团队 ID' }),
  type: z.enum(Object.values(DiscountCouponTypeEnum)).meta({ description: '优惠券类型' }),
  startTime: z.coerce.date().optional().meta({ description: '生效时间' }),
  expiredTime: z.coerce.date().meta({ description: '过期时间' }),
  usedAt: z.coerce.date().optional().meta({ description: '使用时间' }),
  createTime: z.coerce.date().meta({ description: '创建时间' })
});

export type DiscountCouponSchemaType = z.infer<typeof DiscountCouponSchema>;

export const DiscountCouponItemSchema = DiscountCouponSchema.extend({
  name: z.string().meta({ description: '优惠券名称' }),
  description: z.string().meta({ description: '优惠券描述' }),
  discount: z.number().min(0).max(1).meta({ description: '折扣率' }),
  iconZh: z.string().meta({ description: '中文图标路径' }),
  iconEn: z.string().meta({ description: '英文图标路径' }),
  status: z.enum(DiscountCouponStatusEnum).meta({ description: '优惠券状态' }),
  billId: ObjectIdSchema.optional().meta({
    description: '关联的订单 ID, 被使用后该值存在'
  })
});
export const DiscountCouponListResponseSchema = z.array(DiscountCouponItemSchema);

export type DiscountCouponListResponseType = z.infer<typeof DiscountCouponListResponseSchema>;
