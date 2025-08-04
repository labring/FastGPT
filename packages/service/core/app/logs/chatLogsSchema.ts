import type { AppChatLogSchema } from '@fastgpt/global/core/app/logs/type';
import { getMongoLogModel, Schema } from '../../../common/mongo';
import { AppCollectionName } from '../schema';

export const ChatLogCollectionName = 'app_chat_logs';

const ChatLogSchema = new Schema({
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  chatId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  sourceName: {
    type: String
  },
  createTime: {
    type: Date,
    required: true
  },
  updateTime: {
    type: Date,
    required: true
  },
  // 累计统计字段
  chatItemCount: {
    type: Number,
    default: 0
  },
  errorCount: {
    type: Number,
    default: 0
  },
  totalPoints: {
    type: Number,
    default: 0
  },
  goodFeedbackCount: {
    type: Number,
    default: 0
  },
  badFeedbackCount: {
    type: Number,
    default: 0
  },
  totalResponseTime: {
    type: Number,
    default: 0
  },
  isFirstChat: {
    type: Boolean,
    default: false
  }
});

ChatLogSchema.index({ teamId: 1, appId: 1, source: 1, updateTime: -1 });
ChatLogSchema.index({ userId: 1, appId: 1, source: 1, createTime: -1 });

export const MongoAppChatLog = getMongoLogModel<AppChatLogSchema>(
  ChatLogCollectionName,
  ChatLogSchema
);
