import type { AppChatLogSchema } from '@fastgpt/global/core/app/logs/type';
import { getMongoLogModel, Schema } from '../../../common/mongo';
import { AppCollectionName } from '../schema';

export const ChatLogCollectionName = 'app_chat_logs';

const ChatLogSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
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

// Get chart data
ChatLogSchema.index({ teamId: 1, appId: 1, source: 1, updateTime: -1 });
// Get chart data isFirstChat
ChatLogSchema.index({ isFirstChat: 1, teamId: 1, appId: 1, source: 1, createTime: -1 });
// Get userStats
ChatLogSchema.index({ teamId: 1, appId: 1, userId: 1 });

// Admin get chat form data - optimized for aggregation with appId/chatId grouping
ChatLogSchema.index({ createTime: -1, appId: 1, chatId: 1 });

// Init shell
ChatLogSchema.index({ teamId: 1, appId: 1, chatId: 1 });

export const MongoAppChatLog = getMongoLogModel<AppChatLogSchema>(
  ChatLogCollectionName,
  ChatLogSchema
);
