import { Schema, model, models, Model } from 'mongoose';
import { ShareChatSchema as ShareChatSchemaType } from '@/types/mongoSchema';

const ShareChatSchema = new Schema({
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
  name: {
    type: String,
    required: true
  },
  tokens: {
    type: Number,
    default: 0
  },
  maxContext: {
    type: Number,
    default: 20
  },
  lastTime: {
    type: Date
  }
});

export const ShareChat: Model<ShareChatSchemaType> =
  models['shareChat'] || model('shareChat', ShareChatSchema);
