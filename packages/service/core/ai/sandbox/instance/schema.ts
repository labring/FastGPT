import { connectionMongo, getMongoModel } from '../../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType } from '../type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { SandboxLimitSchema, SandboxProviderSchema } from '../type';

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
  // Chat 模式和 skill sandbox 都会复用这组根字段。
  appId: String,
  userId: String,
  chatId: String,
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

SandboxInstanceSchema.index(
  { provider: 1, appId: 1, userId: 1, chatId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      // Keep the index compatible with Mongo-compatible backends that do not
      // support `$ne: null` inside partial indexes.
      appId: { $exists: true },
      userId: { $exists: true },
      chatId: { $exists: true }
    }
  }
);
SandboxInstanceSchema.index({ status: 1, lastActiveAt: 1 });
SandboxInstanceSchema.index({ provider: 1, sandboxId: 1 }, { unique: true });
SandboxInstanceSchema.index(
  { appId: 1, chatId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      appId: { $exists: true },
      chatId: { $exists: true },
      type: { $exists: true }
    }
  }
);
SandboxInstanceSchema.index({ 'metadata.skillId': 1 });
SandboxInstanceSchema.index({ type: 1, chatId: 1 });

/**
 * sandbox 实例 Mongo model。
 *
 * 只在 instance/repository 中封装常规读写；需要跨层使用时优先新增 repository 方法。
 */
export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  collectionName,
  SandboxInstanceSchema
);
