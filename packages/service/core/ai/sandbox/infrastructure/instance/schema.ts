/**
 * 沙盒原子层：定义 SandboxInstance Mongo schema。
 *
 * 只描述本地实例记录结构，不编排 provider、归档或运行态流程。
 */
import { connectionMongo, defineIndex, getMongoModel } from '../../../../../common/mongo';
const { Schema } = connectionMongo;
import { SandboxImageConfigSchema } from '@fastgpt/global/core/ai/sandbox/type';
import type { SandboxInstanceSchemaType } from '../../type';
import {
  SANDBOX_PROVIDER,
  SandboxInstanceStatusSchema,
  SandboxOperationTypeSchema,
  SandboxSourceTypeSchema
} from '../../type';
import { expectedOperationByStatus } from '../../constants';

/**
 * 4.18.0 sandbox 实例记录集合（与 4.17.x `agent_sandbox_instances_v2` 双表隔离）。
 *
 * 记录 FastGPT 业务归属和远端 provider 资源的映射关系，远端资源本身不在 Mongo 中保存。
 */
export const collectionName = 'agent_sandbox_instances_v3';

/** 4.17.x 旧版 sandbox 实例集合名称（仅用于只读迁移、运行期门禁/对账保护及历史遗留资源清理的只读扫描，不删除旧集合及记录）。 */
export const LEGACY_SANDBOX_INSTANCE_COLLECTION_NAME = 'agent_sandbox_instances_v2' as const;

const SandboxOperationMongoSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: SandboxOperationTypeSchema.options, required: true },
    phase: { type: String, required: true },
    previousStatus: { type: String, enum: ['running', 'stopped', 'archived'] },
    startedAt: { type: Date, required: true },
    heartbeatAt: { type: Date, required: true },
    failedAt: Date,
    retryAfter: Date,
    error: String
  },
  { _id: false, strict: 'throw' }
);

const SandboxImageMongoSchema = new Schema(
  {
    repository: { type: String, required: true },
    tag: String
  },
  { _id: false, strict: 'throw' }
);

const SandboxLimitMongoSchema = new Schema(
  {
    cpuCount: Number,
    memoryMiB: Number
  },
  { _id: false }
);

const SandboxInstanceSchema = new Schema(
  {
    provider: {
      type: String,
      enum: [SANDBOX_PROVIDER],
      default: SANDBOX_PROVIDER,
      required: true
    },
    // 物理 OpenSandbox 容器/Pod ID（激活进入 running 时原子持久化，用于 skipHealthCheck 快路径直连）
    instanceId: {
      type: String
    },
    // sourceType 前缀 + sourceId/userId hash，和 Provider 物理资源 ID 保持一致。
    sandboxId: {
      type: String,
      required: true
    },
    sourceType: {
      type: String,
      enum: SandboxSourceTypeSchema.options,
      required: true
    },
    sourceId: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: SandboxInstanceStatusSchema.options,
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
    limit: SandboxLimitMongoSchema,
    storage: {
      type: Schema.Types.Mixed
    },
    teamId: String,
    image: {
      type: SandboxImageMongoSchema,
      set: (value: unknown) => SandboxImageConfigSchema.parse(value)
    },
    versionId: String,
    operation: SandboxOperationMongoSchema
  },
  {
    strict: 'throw'
  }
);

SandboxInstanceSchema.pre('validate', function validateLifecycleState() {
  const status = this.get('status');
  const operationType = this.get('operation.type') as string | undefined;
  const expectedOperation = expectedOperationByStatus[status];

  if (!expectedOperation && operationType) {
    throw new Error(`Stable status ${status} must not keep an operation`);
  }
  if (expectedOperation && operationType !== expectedOperation) {
    throw new Error(`Status ${status} requires ${expectedOperation} operation`);
  }
});

defineIndex(SandboxInstanceSchema, {
  key: { provider: 1, sandboxId: 1 },
  options: { unique: true }
});
defineIndex(SandboxInstanceSchema, {
  key: { sourceType: 1, sourceId: 1, userId: 1 },
  options: { unique: true }
});
defineIndex(SandboxInstanceSchema, {
  key: { teamId: 1, status: 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { status: 1, lastActiveAt: 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { status: 1, 'operation.heartbeatAt': 1 }
});
defineIndex(SandboxInstanceSchema, {
  key: { 'storage.volumes.claimName': 1 },
  options: { name: 'fg_sandbox_inst_claim_name' }
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

/**
 * 返回 4.17.x 旧版 `agent_sandbox_instances_v2` 原始集合句柄。
 *
 * 故意不在 `v2` 上注册 Mongoose Model 或 `defineIndex`，确保 `v2` 保持只读且索引不被改写，
 * 以便降级回 4.17.x 时旧版实例库零改动直接恢复运行。
 */
export const getLegacySandboxInstanceCollection = () =>
  MongoSandboxInstance.db.collection(LEGACY_SANDBOX_INSTANCE_COLLECTION_NAME);
