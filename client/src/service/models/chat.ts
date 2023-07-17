import { Schema, model, models, Model } from 'mongoose';
import { ChatSchema as ChatType } from '@/types/mongoSchema';
import { ChatRoleMap } from '@/constants/chat';

const ChatSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'app',
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  title: {
    type: String,
    default: '历史记录'
  },
  customTitle: {
    type: String,
    default: ''
  },
  top: {
    type: Boolean
  },
  variables: {
    type: Object,
    default: {}
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
          default: ''
        },
        rawSearch: {
          type: [
            {
              id: String,
              q: String,
              a: String,
              kb_id: String,
              source: String
            }
          ],
          default: []
        }
      }
    ],
    default: []
  }
});

export const Chat: Model<ChatType> = models['chat'] || model('chat', ChatSchema);
