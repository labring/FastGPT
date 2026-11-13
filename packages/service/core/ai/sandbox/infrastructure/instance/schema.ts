/**
 * 沙盒原子层：定义 SandboxInstance Mongo schema。
 *
 * 只描述本地实例记录结构，不编排 OpenSandbox 或运行态流程。
 */
import { connectionMongo, defineIndex, getMongoModel } from '../../../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType, SandboxInstanceStatusType } from '../../type';
import {
  SandboxInstanceStatusSchema,
  SandboxOperationTypeSchema,
  SandboxSourceTypeSchema
} from '../../type';
import { expectedOperationByStatus } from '../../constants';

/**
 * sandbox 实例记录集合。
 *
 * 记录 FastGPT 业务归属和远端 OpenSandbox 资源的映射关系，远端资源本身不在 Mongo 中保存。
 */
export const collectionName = 'agent_sandbox_instances_v3';

const SandboxResourceLimitsMongoSchema = new Schema(
  {
    cpuCount: Number,
    memoryMiB: Number,
    ephemeralStorageSize: String
  },
  { _id: false, strict: 'throw' }
);

const SandboxVolumeMongoSchema = new Schema(
  {
    name: { type: String, required: true },
    claimName: { type: String, required: true },
    mountPath: { type: String, required: true },
    readOnly: { type: Boolean, default: false }
  },
  { _id: false, strict: 'throw' }
);

const SandboxStorageMongoSchema = new Schema(
  {
    // 默认保持 undefined，避免无持久卷的沙盒被隐式填充为空数组 []。
    volumes: { type: [SandboxVolumeMongoSchema], default: undefined }
  },
  { _id: false, strict: 'throw' }
);

const SandboxContextMongoSchema = new Schema(
  {
    skillVersionId: String
  },
  { _id: false, strict: 'throw' }
);

const SandboxOperationMongoSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: SandboxOperationTypeSchema.options, required: true },
    phase: { type: String, required: true },
    startedAt: { type: Date, required: true },
    heartbeatAt: { type: Date, required: true },
    failedAt: Date,
    error: String
  },
  { _id: false, strict: 'throw' }
);

const SandboxInstanceSchema = new Schema(
  {
    // sourceType 前缀 + sourceId/userId hash，唯一标识逻辑沙盒会话。
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
    teamId: {
      type: String,
      required: true
    },

    instanceId: String,
    image: String,
    resourceLimits: SandboxResourceLimitsMongoSchema,

    storage: SandboxStorageMongoSchema,
    context: SandboxContextMongoSchema,

    status: {
      type: String,
      enum: SandboxInstanceStatusSchema.options,
      required: true
    },
    operation: SandboxOperationMongoSchema,
    lastActiveAt: {
      type: Date,
      default: () => new Date(),
      required: true
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
      required: true
    }
  },
  {
    strict: 'throw'
  }
);

SandboxInstanceSchema.pre('validate', function validateLifecycleState() {
  const status = this.get('status') as SandboxInstanceStatusType;
  const operationType = this.get('operation.type') as string | undefined;
  const expectedOperation = expectedOperationByStatus[status];

  if (!expectedOperation && operationType) {
    throw new Error(`Stable status ${status} must not keep an operation`);
  }
  if (expectedOperation && operationType !== expectedOperation) {
    throw new Error(`Status ${status} requires ${expectedOperation} operation`);
  }

  const instanceId = this.get('instanceId') as string | null | undefined;
  const hasInstanceId = typeof instanceId === 'string' && instanceId.trim().length > 0;
  if (status === 'running' && !hasInstanceId) {
    throw new Error('Running status requires a non-empty instanceId');
  }
  if (status === 'stopped' && instanceId !== undefined && instanceId !== null) {
    throw new Error('Stopped status must not keep an instanceId');
  }
});

defineIndex(SandboxInstanceSchema, {
  key: { sandboxId: 1 },
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
  key: { 'storage.volumes.claimName': 1 }
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
