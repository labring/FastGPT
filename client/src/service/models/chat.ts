import { Schema, model, models, Model } from 'mongoose';
import { ChatSchema as ChatType } from '@/types/mongoSchema';
import { ChatRoleMap, TaskResponseKeyEnum } from '@/constants/chat';
import { ChatSourceEnum, ChatSourceMap } from '@/constants/chat';

const ChatSchema = new Schema({
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
  source: {
    type: String,
    enum: Object.keys(ChatSourceMap),
    required: true
  },
  shareId: {
    type: String
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
        [TaskResponseKeyEnum.responseData]: {
          type: [
            {
              moduleName: String,
              price: String,
              model: String,
              tokens: Number,
              question: String,
              answer: String,
              temperature: Number,
              maxToken: Number,
              finishMessages: Array,
              similarity: Number,
              limit: Number,
              cqList: Array,
              cqResult: String
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
