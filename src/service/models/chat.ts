import { Schema, model, models, Model } from 'mongoose';
import { ChatSchema as ChatType } from '@/types/mongoSchema';
import { ChatRoleMap } from '@/constants/chat';

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
    default: () => new Date()
  },
  loadAmount: {
    // 剩余加载次数
    type: Number,
    default: -1
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  title: {
    type: String,
    default: '历史记录'
  },
  latestChat: {
    type: String,
    default: ''
  },
  content: {
    type: [
      {
        obj: {
          type: String,
          required: true,
          enum: Object.keys(ChatRoleMap)
        },
        value: {
          type: String,
          required: true
        },
        quote: {
          type: [
            {
              id: {
                type: String,
                required: true
              },
              q: {
                type: String,
                default: ''
              },
              a: {
                type: String,
                default: ''
              },
              isEdit: {
                type: String,
                default: false
              }
            }
          ],
          default: []
        },
        systemPrompt: {
          type: String,
          default: ''
        }
      }
    ],
    default: []
  }
});

export const Chat: Model<ChatType> = models['chat'] || model('chat', ChatSchema);
