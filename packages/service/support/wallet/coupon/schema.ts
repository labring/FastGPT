import { addDays } from 'date-fns';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { TeamCouponSchema } from '@fastgpt/global/support/wallet/sub/coupon/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { CouponTypeEnum } from '@fastgpt/global/support/wallet/sub/coupon/constants';
import {
  CouponSceneEnum,
  CouponStatusEnum,
  CouponTypeEnum as DiscountCouponTypeEnum
} from '@fastgpt/global/support/wallet/coupon/constants';
import type { CouponSchemaType } from '@fastgpt/global/support/wallet/coupon/type';

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

export const discountCouponCollectionName = 'team_discount_coupons';

const DiscountCouponSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  discount: {
    type: Number,
    required: true,
    min: 0.01,
    max: 1
  },
  scenes: {
    type: [String],
    enum: Object.values(CouponSceneEnum),
    required: true
  },
  status: {
    type: String,
    enum: Object.values(CouponStatusEnum),
    default: CouponStatusEnum.unused
  },
  startTime: {
    type: Date,
    default: () => new Date()
  },
  expiredTime: {
    type: Date,
    required: true
  },
  usedTime: {
    type: Date
  },
  billId: {
    type: Schema.Types.ObjectId
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  type: {
    type: [String],
    enum: Object.values(DiscountCouponTypeEnum),
    required: true
  },
  level: {
    type: [String]
  }
});

try {
  DiscountCouponSchema.index({ teamId: 1, status: 1, expiredTime: -1 });
  DiscountCouponSchema.index({ teamId: 1, type: 1, status: 1, expiredTime: -1 });
  DiscountCouponSchema.index({ status: 1, expiredTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamDiscountCoupon = getMongoModel<CouponSchemaType>(
  discountCouponCollectionName,
  DiscountCouponSchema
);
