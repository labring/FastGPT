import { Schema, model, models, Model } from 'mongoose';
import { ShareChatSchema as ShareChatSchemaType } from '@/types/mongoSchema';
import { hashPassword } from '@/service/utils/tools';

const ShareChatSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  modelId: {
    type: Schema.Types.ObjectId,
    ref: 'model',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    set: (val: string) => hashPassword(val)
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
