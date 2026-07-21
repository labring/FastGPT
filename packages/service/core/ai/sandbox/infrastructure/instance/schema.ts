/**
 * 沙盒原子层：定义 SandboxInstance Mongo schema。
 *
 * 只描述本地实例记录结构，不编排 provider、归档或运行态流程。
 */
import { connectionMongo, defineIndex, getMongoModel } from '../../../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType } from '../../type';
import { SandboxStatusEnum, SandboxTypeEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxLimitSchema, SandboxProviderSchema } from '../../type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

/**
 * sandbox 实例记录集合。
 *
 * 记录 FastGPT 业务归属和远端 provider 资源的映射关系，远端资源本身不在 Mongo 中保存。
 */
export const collectionName = 'agent_sandbox_instances';

const SandboxInstanceSchema = new Schema({
  provider: {
    type: String,
    enum: SandboxProviderSchema.options,
    required: true
  },
  // 唯一 id，chat 模式下，由 3 个 id hash 获取。
  sandboxId: {
    type: String,
    required: true
  },
  // @deprecated 仅保留给 4.15.0-beta6 一次性迁移脚本识别旧 sandbox 归属。
  // 运行时业务必须使用 sourceType/sourceId。
  appId: String,
  sourceType: {
    type: String,
    enum: Object.values(ChatSourceTypeEnum),
    required: true
  },
  sourceId: {
    type: String,
    required: true
  },
  userId: String,
  chatId: String,
  // @deprecated sandbox 归属统一使用 sourceType/sourceId；保留字段仅为历史数据迁移与兼容读取。
  type: {
    type: String,
    enum: Object.values(SandboxTypeEnum)
  },

  status: {
    type: String,
    enum: Object.values(SandboxStatusEnum),
    default: SandboxStatusEnum.running,
    required: true
  },
  lastActiveAt: {
    type: Date,
    default: () => new Date(),
    required: true
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
    required: true
  },
  limit: {
    type: SandboxLimitSchema.shape
  },
  storage: {
    type: Schema.Types.Mixed
  },
  metadata: {
    type: Schema.Types.Mixed
  }
});

defineIndex(SandboxInstanceSchema, {
  key: { provider: 1, sandboxId: 1 },
  options: { unique: true }
});
defineIndex(SandboxInstanceSchema, {
  key: { sourceType: 1, sourceId: 1, chatId: 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { sourceType: 1, status: 1, provider: 1, 'metadata.archive.state': 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { status: 1, lastActiveAt: 1, 'metadata.archive.state': 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { 'metadata.archive.state': 1, 'metadata.archive.startedAt': 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { 'metadata.archive.state': 1, 'metadata.archive.deleteStartedAt': 1 }
});

defineIndex(SandboxInstanceSchema, {
  key: { provider: 1, appId: 1, userId: 1, chatId: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      appId: { $exists: true },
      userId: { $exists: true },
      chatId: { $exists: true }
    }
  },
  deprecated: true
});
defineIndex(SandboxInstanceSchema, {
  key: { appId: 1, chatId: 1 },
  options: {
    unique: true,
    partialFilterExpression: {
      appId: { $exists: true },
      chatId: { $exists: true },
      type: { $exists: true }
    }
  },
  deprecated: true
});
defineIndex(SandboxInstanceSchema, {
  key: { 'metadata.skillId': 1 },
  deprecated: true
});
defineIndex(SandboxInstanceSchema, {
  key: { type: 1, chatId: 1 },
  deprecated: true
});

/**
 * sandbox 实例 Mongo model。
 *
 * 只在 instance/repository 中封装常规读写；需要跨层使用时优先新增 repository 方法。
 */
export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  collectionName,
  SandboxInstanceSchema
);
