import type { AppChatLogSchema } from '@fastgpt/global/core/app/logs/type';
import { defineIndex, getMongoLogModel, Schema } from '../../../common/mongo';
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
  // 累计当前 workflow 轮次的 LLM token；由 workflowRuntimeSummary 写入。
  // 历史记录没有这两个字段，读取侧按 0 兜底。
  totalInputTokens: {
    type: Number,
    default: 0
  },
  totalOutputTokens: {
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

// Get log users by app and time range; userId is included for the aggregation group key.
defineIndex(ChatLogSchema, { key: { teamId: 1, appId: 1, updateTime: -1, userId: 1 } });
// Get chart data isFirstChat
defineIndex(ChatLogSchema, {
  key: { isFirstChat: 1, teamId: 1, appId: 1, source: 1, createTime: -1 }
});
// Detect previous chats by user and create time; the shorter historical index is deprecated below.
defineIndex(ChatLogSchema, {
  key: { teamId: 1, appId: 1, userId: 1, createTime: 1 }
});
// Update record
defineIndex(ChatLogSchema, { key: { teamId: 1, appId: 1, chatId: 1 } });

// Deprecated indexes
// Get chart data with a source filter.
defineIndex(ChatLogSchema, {
  key: { teamId: 1, appId: 1, source: 1, updateTime: -1 },
  deprecated: true
});
defineIndex(ChatLogSchema, {
  key: { teamId: 1, appId: 1, userId: 1 },
  deprecated: true
});
defineIndex(ChatLogSchema, {
  key: { createTime: -1, appId: 1, chatId: 1 },
  deprecated: true
});

export const MongoAppChatLog = getMongoLogModel<AppChatLogSchema>(
  ChatLogCollectionName,
  ChatLogSchema
);
