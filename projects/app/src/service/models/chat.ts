import { Schema, model, models, Model } from 'mongoose';
import { ChatSchema as ChatType } from '@/types/mongoSchema';
import { ChatRoleMap, TaskResponseKeyEnum } from '@/constants/chat';
import { ChatSourceMap } from '@/constants/chat';

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
  isInit: {
    type: Boolean,
    default: false
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
          type: Array,
          default: []
        }
      }
    ],
    default: []
  }
});

try {
  ChatSchema.index({ userId: 1 });
  ChatSchema.index({ updateTime: -1 });
  ChatSchema.index({ appId: 1 });
} catch (error) {
  console.log(error);
}

export const Chat: Model<ChatType> = models['chat'] || model('chat', ChatSchema);
