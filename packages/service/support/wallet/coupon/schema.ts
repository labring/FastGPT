import { addDays } from 'date-fns';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type {
  TeamCouponSchema,
  DiscountCouponSchema as DiscountCouponSchemaType
} from '@fastgpt/global/support/wallet/sub/coupon/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import {
  CouponTypeEnum,
  DiscountCouponTypeEnum
} from '@fastgpt/global/support/wallet/sub/coupon/constants';

export const couponCollectionName = 'team_sub_coupons';

const CouponSchema = new Schema({
  key: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(CouponTypeEnum)
  },
  price: Number,
  description: String,
  subscriptions: {
    type: [Object],
    required: true
  },
  redeemedAt: {
    type: Date,
    default: undefined
  },
  redeemedTeamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  expiredAt: {
    type: Date,
    default: () => addDays(new Date(), 7)
  }
});

try {
  CouponSchema.index({ key: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoTeamCoupon = getMongoModel<TeamCouponSchema>(couponCollectionName, CouponSchema);

export const discountCouponCollectionName = 'discount_coupons';

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
