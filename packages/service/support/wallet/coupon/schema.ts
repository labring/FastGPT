import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { TeamCouponSchema } from '@fastgpt/global/support/wallet/sub/coupon/type';

export const couponCollectionName = 'team_sub_coupons';

const CouponSchema = new Schema({
  key: {
    type: String,
    required: true
  },
  subscriptions: {
    type: [Object],
    required: true
  },
  redeemedAt: {
    type: Date,
    default: undefined
  },
  expiredAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
});

try {
  CouponSchema.index({ key: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoTeamCoupon = getMongoModel<TeamCouponSchema>(couponCollectionName, CouponSchema);
