import { Schema, model, models, Model } from 'mongoose';
import { OutLinkSchema as SchemaType } from '@/types/support/outLink';
import { OutLinkTypeEnum } from '@/constants/chat';

const OutLinkSchema = new Schema({
  shareId: {
    type: String,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  },
  type: {
    type: String,
    default: OutLinkTypeEnum.share
  },
  name: {
    type: String,
    required: true
  },
  total: {
    // total amount
    type: Number,
    default: 0
  },
  lastTime: {
    type: Date
  },
  responseDetail: {
    type: Boolean,
    default: false
  },
  limit: {
    expiredTime: {
      type: Date
    },
    QPM: {
      type: Number,
      default: 1000
    },
    credit: {
      type: Number,
      default: -1
    },
    hookUrl: {
      type: String
    }
  }
});

export const OutLink: Model<SchemaType> = models['outlinks'] || model('outlinks', OutLinkSchema);
