import { Schema, model, models, Model } from 'mongoose';
import { OutLinkSchema as SchmaType } from '@/types/mongoSchema';
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
    type: Number,
    default: 0
  },
  lastTime: {
    type: Date
  }
});

export const OutLink: Model<SchmaType> = models['outlinks'] || model('outlinks', OutLinkSchema);
