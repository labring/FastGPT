/**
 * 沙盒原子层：定义 SandboxInstance Mongo schema。
 *
 * 只描述本地实例记录结构，不编排 provider、归档或运行态流程。
 */
import { connectionMongo, getMongoModel } from '../../../../../common/mongo';
const { Schema } = connectionMongo;
import type { SandboxInstanceSchemaType } from '../../type';
import {
  SandboxInstanceStatusSchema,
  SandboxLimitSchema,
  SandboxLifecycleTypeSchema,
  SandboxMetadataSchema,
  SandboxProviderSchema,
  SandboxSourceTypeSchema
} from '../../type';

/**
 * sandbox 实例记录集合。
 *
 * 记录 FastGPT 业务归属和远端 provider 资源的映射关系，远端资源本身不在 Mongo 中保存。
 */
export const collectionName = 'agent_sandbox_instances_v2';

const SandboxMetadataMongoSchema = new Schema(
  {
    teamId: String,
    tmbId: String,
    volumeEnabled: Boolean,
    sessionId: String,
    skillIds: [String],
    image: {
      type: new Schema(
        {
          repository: { type: String, required: true },
          tag: String
        },
        { _id: false, strict: 'throw' }
      )
    },
    skillName: String,
    versionId: String,
    upstreamId: String,
    activeSaga: {
      type: new Schema(
        {
          sagaId: { type: String, required: true },
          type: { type: String, enum: SandboxLifecycleTypeSchema.options, required: true }
        },
        { _id: false, strict: 'throw' }
      )
    }
  },
  { _id: false, strict: 'throw' }
);

const SandboxInstanceSchema = new Schema(
  {
    provider: {
      type: String,
      enum: SandboxProviderSchema.options,
      required: true
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
    limit: {
      type: SandboxLimitSchema.shape
    },
    storage: {
      type: Schema.Types.Mixed
    },
    metadata: {
      type: SandboxMetadataMongoSchema,
      set: (value: unknown) => SandboxMetadataSchema.parse(value)
    }
  },
  {
    strict: 'throw'
  }
);

const expectedSagaByStatus: Record<string, string | undefined> = {
  provisioning: 'provision',
  legacyMigrating: 'legacyMigration',
  running: undefined,
  stopping: 'stop',
  stopped: undefined,
  archiving: 'archive',
  archived: undefined,
  restoring: 'restore',
  providerMigrating: 'providerMigration',
  deleting: 'delete'
};

SandboxInstanceSchema.pre(
  'validate',
  function validateLifecycleState(this: { get(path: string): unknown }) {
    const status = this.get('status') as string;
    const activeSagaType = this.get('metadata.activeSaga.type') as string | undefined;
    const expectedSaga = expectedSagaByStatus[status];

    if (!expectedSaga && activeSagaType) {
      throw new Error(`Stable status ${status} must not keep an activeSaga`);
    }
    if (expectedSaga && activeSagaType !== expectedSaga) {
      throw new Error(`Status ${status} requires ${expectedSaga} activeSaga`);
    }
  }
);

SandboxInstanceSchema.index({ provider: 1, sandboxId: 1 }, { unique: true });
SandboxInstanceSchema.index({ sourceType: 1, sourceId: 1, userId: 1 }, { unique: true });
SandboxInstanceSchema.index({ sourceType: 1, status: 1, provider: 1 });
SandboxInstanceSchema.index({ status: 1, lastActiveAt: 1 });
SandboxInstanceSchema.index({ status: 1, 'metadata.activeSaga.sagaId': 1 });

/**
 * sandbox 实例 Mongo model。
 *
 * 只在 instance/repository 中封装常规读写；需要跨层使用时优先新增 repository 方法。
 */
export const MongoSandboxInstance = getMongoModel<SandboxInstanceSchemaType>(
  collectionName,
  SandboxInstanceSchema
);
