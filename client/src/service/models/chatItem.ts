import { Schema, model, models, Model } from 'mongoose';
import { ChatItemSchema as ChatItemType } from '@/types/mongoSchema';
import { ChatRoleMap, TaskResponseKeyEnum } from '@/constants/chat';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 24);

const ChatItemSchema = new Schema({
  dataId: {
    type: String,
    require: true,
    default: () => nanoid()
  },
  chatId: {
    type: String,
    require: true
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
  time: {
    type: Date,
    default: () => new Date()
  },
  obj: {
    type: String,
    required: true,
    enum: Object.keys(ChatRoleMap)
  },
  value: {
    type: String,
    default: ''
  },
  userFeedback: {
    type: String
  },
  adminFeedback: {
    type: {
      kbId: String,
      dataId: String,
      content: String
    }
  },
  [TaskResponseKeyEnum.responseData]: {
    type: Array,
    default: []
  }
});

try {
  ChatItemSchema.index({ time: -1 });
  ChatItemSchema.index({ userId: 1 });
  ChatItemSchema.index({ appId: 1 });
  ChatItemSchema.index({ chatId: 1 });
  ChatItemSchema.index({ userFeedback: 1 });
} catch (error) {
  console.log(error);
}

export const ChatItem: Model<ChatItemType> =
  models['chatItem'] || model('chatItem', ChatItemSchema);
