import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { DiscountCouponTypeEnum } from '@fastgpt/global/support/wallet/sub/discountCoupon/constants';
import type { DiscountCouponSchemaType } from '@fastgpt/global/openapi/support/wallet/discountCoupon/api';

export const discountCouponCollectionName = 'team_discount_coupons';

const DiscountCouponSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: Object.values(DiscountCouponTypeEnum)
  },
  startTime: Date,
  expiredTime: {
    type: Date,
    required: true
  },
  usedAt: Date,
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  DiscountCouponSchema.index({ status: 1, type: 1 });
  DiscountCouponSchema.index({ teamId: 1, status: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDiscountCoupon = getMongoModel<DiscountCouponSchemaType>(
  discountCouponCollectionName,
  DiscountCouponSchema
);
