import { addDays } from 'date-fns';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { TeamCouponSchemaType } from '@fastgpt/global/support/wallet/sub/coupon/type';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { CouponTypeEnum } from '@fastgpt/global/support/wallet/sub/coupon/constants';

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
  paidAmount: Number,
  transactionId: String,
  description: String,
  subscriptions: {
    type: [Object],
    required: true
  },
  createdAt: {
    type: Date,
    default: () => new Date()
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

defineIndex(CouponSchema, { key: { key: 1 }, options: { unique: true } });

export const MongoTeamCoupon = getMongoModel<TeamCouponSchemaType>(
  couponCollectionName,
  CouponSchema
);
