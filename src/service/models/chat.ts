import { Schema, model, models, Model } from 'mongoose';
import { ChatSchema as ChatType } from '@/types/mongoSchema';

const ChatSchema = new Schema({
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
  expiredTime: {
    // 过期时间
    type: Number,
    required: true
  },
  loadAmount: {
    // 剩余加载次数
    type: Number,
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  isShare: {
    type: Boolean,
    default: false
  },
  content: {
    type: [
      {
        obj: {
          type: String,
          required: true,
          enum: ['Human', 'AI', 'SYSTEM']
        },
        value: {
          type: String,
          required: true
        },
        deleted: {
          type: Boolean,
          default: false
        }
      }
    ],
    default: []
  }
});

export const Chat: Model<ChatType> = models['chat'] || model('chat', ChatSchema);
