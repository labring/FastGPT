import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType } from './type';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxProtocolEnum, SandboxTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { SandboxLimitSchema, SandboxProviderSchema } from './type';

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
      'metadata.sandboxType': { $exists: true }
    }
  }
);
SandboxInstanceSchema.index({ 'metadata.skillId': 1 });
SandboxInstanceSchema.index({ 'metadata.sandboxType': 1, chatId: 1 });

export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  collectionName,
  SandboxInstanceSchema
);
