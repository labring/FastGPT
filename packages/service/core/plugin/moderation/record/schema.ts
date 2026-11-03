import { defineIndex, connectionMongo, getMongoModel } from '../../../../common/mongo/index';
import {
  ModerationActionEnum,
  ModerationStageEnum,
  type ModerationRecordType
} from '@fastgpt/global/core/plugin/moderation/type';

const { Schema } = connectionMongo;

export const collectionName = 'system_moderation_records';

/**
 * 内容审查审计记录集合
 *
 * 记录运行时所有审查调用与裁决结果，供管理端审计（/admin/moderation/records）与合规复核使用。
 */
const SystemModerationRecordSchema = new Schema({
  teamId: {
    type: String
  },
  tmbId: {
    type: String
  },
  appId: {
    type: String
  },
  chatId: {
    type: String
  },
  responseChatItemId: {
    type: String
  },
  requestId: {
    type: String
  },

  // 1. 审核环节与上下文
  stage: {
    type: String,
    enum: Object.values(ModerationStageEnum),
    required: true
  },
  nodeId: {
    type: String
  },
  nodeName: {
    type: String
  },
  targetField: {
    type: String
  },

  // 2. 被审内容与结果
  content: {
    type: String,
    required: true
  },
  pluginId: {
    type: String
  },
  provider: {
    type: String
  },
  verdict: {
    type: String,
    enum: ['pass', 'suspected', 'block', 'error'],
    required: true
  },
  keywords: {
    type: [String],
    default: []
  },
  hits: {
    type: Array,
    default: []
  },
  errorMessage: {
    type: String
  },

  // 3. 平台最终采取的执行策略与动作
  actionTaken: {
    type: String,
    enum: Object.values(ModerationActionEnum),
    required: true
  },

  duration: {
    type: Number
  },
  createTime: {
    type: Date,
    default: Date.now
  }
});

// 索引设计（全部使用 defineIndex 声明，无直接 schema.index 调用）
defineIndex(SystemModerationRecordSchema, { key: { createTime: -1 } });
defineIndex(SystemModerationRecordSchema, { key: { teamId: 1, createTime: -1 } });
defineIndex(SystemModerationRecordSchema, { key: { verdict: 1, createTime: -1 } });
defineIndex(SystemModerationRecordSchema, { key: { stage: 1, createTime: -1 } });
defineIndex(SystemModerationRecordSchema, { key: { appId: 1, createTime: -1 } });

export const MongoSystemModerationRecord = getMongoModel<ModerationRecordType>(
  collectionName,
  SystemModerationRecordSchema
);
