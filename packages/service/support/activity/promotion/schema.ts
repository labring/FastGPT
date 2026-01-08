import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { type PromotionRecordSchema as PromotionRecordType } from '@fastgpt/global/support/activity/type.d';

const PromotionRecordSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  objUId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: false
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  type: {
    type: String,
    required: true,
    enum: ['pay', 'register']
  },
  amount: {
    // 1 * PRICE_SCALE
    type: Number,
    required: true
  }
});

PromotionRecordSchema.index({ userId: 1 });

export const MongoPromotionRecord = getMongoModel<PromotionRecordType>(
  'promotionRecord',
  PromotionRecordSchema
);
