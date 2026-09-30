import { SystemMigrationStatusEnum } from '@fastgpt/global/migration/constants';
import type {
  SystemMigrationError,
  SystemMigrationFailedRecord,
  SystemMigrationProgress,
  SystemMigrationResultData
} from '@fastgpt/global/migration/schema';
import { connectionMongo, defineIndex, getMongoModel } from '@fastgpt/service/common/mongo';

const { Schema } = connectionMongo;

export const SystemMigrationCollectionName = 'system_migration_states';
export const SystemMigrationFailedRecordCollectionName = 'system_migration_failed_records';

/**
 * 每个静态任务对应一条状态记录，_id 即任务 ID。
 * 静态名称、版本、顺序和阻塞属性不落库，避免发布后数据库元数据与代码注册表漂移。
 */
export type SystemMigrationStateSchemaType = {
  _id: string;
  status: SystemMigrationStatusEnum;
  /** runId 是写入 fencing token。 */
  runId?: string;
  heartbeatAt?: Date;
  leaseExpireAt?: Date;
  /** checkpoint 服务于崩溃恢复，progress 仅服务于管理员展示，两者不能混用。 */
  checkpoint?: Record<string, unknown>;
  progress?: SystemMigrationProgress[];
  /** 只在 succeeded 终态存在，用于展示任务最终产出，不复用运行中 progress。 */
  result?: SystemMigrationResultData;
  /** 只保留最近一次明确失败，不在状态表维护事件历史。 */
  lastError?: SystemMigrationError;
  startedAt?: Date;
  lastStartedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const SystemMigrationErrorSubSchema = new Schema<SystemMigrationError>(
  {
    message: String,
    stageKey: String,
    runId: String,
    createdAt: Date
  },
  { _id: false }
);

const SystemMigrationProgressSubSchema = new Schema<SystemMigrationProgress>(
  {
    key: String,
    status: {
      type: String,
      enum: Object.values(SystemMigrationStatusEnum),
      required: true
    },
    params: Schema.Types.Mixed,
    current: Number,
    total: Number,
    updatedAt: Date,
    error: {
      type: SystemMigrationErrorSubSchema,
      default: undefined
    }
  },
  { _id: false }
);

const SystemMigrationFailureDetailSubSchema = new Schema<SystemMigrationFailedRecord['reason']>(
  {
    message: String
  },
  { _id: false }
);

/** 失败数据独立成行，避免任务状态文档随坏数据数量增长。 */
export type SystemMigrationFailedRecordSchemaType = SystemMigrationFailedRecord & {
  migrationId: string;
  runId: string;
  createdAt: Date;
};

const SystemMigrationFailedRecordSchema = new Schema<SystemMigrationFailedRecordSchemaType>({
  migrationId: {
    type: String,
    required: true
  },
  runId: {
    type: String,
    required: true
  },
  stageKey: {
    type: String,
    required: true
  },
  data: {
    type: Schema.Types.Mixed,
    required: true
  },
  reason: {
    type: SystemMigrationFailureDetailSubSchema,
    required: true
  },
  createdAt: {
    type: Date,
    required: true,
    default: () => new Date()
  }
});

// 列表按任务和阶段聚合；migrationId 前缀同时支持详情查询和成功清理。
defineIndex(SystemMigrationFailedRecordSchema, { key: { migrationId: 1, stageKey: 1 } });

/**
 * 状态表不声明额外索引：所有 runner 读写均以任务 _id 精确定位，使用 Mongo 自带唯一索引即可。
 */
const SystemMigrationStateSchema = new Schema<SystemMigrationStateSchemaType>(
  {
    _id: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: Object.values(SystemMigrationStatusEnum),
      required: true,
      default: SystemMigrationStatusEnum.pending
    },
    runId: String,
    heartbeatAt: Date,
    leaseExpireAt: Date,
    checkpoint: Schema.Types.Mixed,
    progress: {
      type: [SystemMigrationProgressSubSchema],
      default: undefined
    },
    // 结果只保存任务产生的业务参数；展示模板由静态注册表提供。
    result: Schema.Types.Mixed,
    lastError: {
      type: SystemMigrationErrorSubSchema,
      default: undefined
    },
    startedAt: Date,
    lastStartedAt: Date,
    completedAt: Date,
    createdAt: {
      type: Date,
      required: true,
      default: () => new Date()
    },
    updatedAt: {
      type: Date,
      required: true,
      default: () => new Date()
    }
  },
  {
    minimize: false
  }
);

export const MongoSystemMigrationState = getMongoModel<SystemMigrationStateSchemaType>(
  SystemMigrationCollectionName,
  SystemMigrationStateSchema
);

export const MongoSystemMigrationFailedRecord =
  getMongoModel<SystemMigrationFailedRecordSchemaType>(
    SystemMigrationFailedRecordCollectionName,
    SystemMigrationFailedRecordSchema
  );
