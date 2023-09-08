import { Schema, model, models, Model } from 'mongoose';
import { BillSchema as BillType } from '@/types/mongoSchema';
import { BillSourceEnum, BillSourceMap } from '@/constants/user';

const BillSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  appName: {
    type: String,
    default: ''
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: false
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  total: {
    type: Number,
    required: true
  },
  source: {
    type: String,
    enum: Object.keys(BillSourceMap),
    default: BillSourceEnum.fastgpt
  },
  list: {
    type: [
      {
        moduleName: {
          type: String,
          required: true
        },
        amount: {
          type: Number,
          required: true
        },
        model: {
          type: String
        },
        tokenLen: {
          type: Number
        }
      }
    ],
    default: []
  }
});

try {
  BillSchema.index({ userId: 1 });
  BillSchema.index({ time: 1 }, { expireAfterSeconds: 90 * 24 * 60 });
} catch (error) {
  console.log(error);
}

export const Bill: Model<BillType> = models['bill'] || model('bill', BillSchema);
