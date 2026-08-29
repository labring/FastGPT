import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;

export const FullTextMigrationLogCollectionName = 'full_text_migration_logs';
export const FullTextMigrationFailedCollectionName = 'full_text_migration_failed';

export type FullTextMigrationStatus = 'running' | 'done' | 'failed' | 'cancelled';

export type FullTextMigrationLogSchemaType = {
  migrationId: string;
  newEngine: 'milvus';
  status: FullTextMigrationStatus;
  cursor: string;
  totalCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
  error?: string;
  updatedAt: Date;
  createdAt: Date;
};

const FullTextMigrationLogSchema = new Schema({
  migrationId: { type: String, required: true },
  newEngine: { type: String, required: true, enum: ['milvus'] },
  status: { type: String, enum: ['running', 'done', 'failed', 'cancelled'], default: 'running' },
  cursor: { type: String, default: '' },
  totalCount: { type: Number, default: 0 },
  processedCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  failedCount: { type: Number, default: 0 },
  error: { type: String },
  updatedAt: { type: Date },
  createdAt: { type: Date, default: () => new Date() }
});

defineIndex(FullTextMigrationLogSchema, {
  key: { migrationId: 1 },
  options: { name: 'migrationId_1', unique: true }
});
// 同引擎同时只有一个 running 迁移:findOne 预检与 create 之间的并发窗口由该唯一部分索引兜底,
// 第二个并发 create 命中重复键 → 转成明确的"已在运行"错误(running 完成/失败/取消后自动放行)。
defineIndex(FullTextMigrationLogSchema, {
  key: { newEngine: 1 },
  options: {
    name: 'newEngine_1_status_running',
    unique: true,
    partialFilterExpression: { status: 'running' }
  }
});
defineIndex(FullTextMigrationLogSchema, {
  key: { status: 1, updatedAt: 1 },
  options: { name: 'status_1_updatedAt_1' }
});

export type FullTextMigrationFailedSchemaType = {
  migrationId: string;
  dataId: string;
  error: string;
  createdAt: Date;
};

const FullTextMigrationFailedSchema = new Schema({
  migrationId: { type: String, required: true },
  dataId: { type: String, required: true },
  error: { type: String },
  createdAt: { type: Date, default: () => new Date() }
});

defineIndex(FullTextMigrationFailedSchema, {
  key: { migrationId: 1, dataId: 1 },
  options: { name: 'migrationId_1_dataId_1', unique: true }
});

export const MongoFullTextMigrationLog = getMongoModel<FullTextMigrationLogSchemaType>(
  FullTextMigrationLogCollectionName,
  FullTextMigrationLogSchema
);
export const MongoFullTextMigrationFailed = getMongoModel<FullTextMigrationFailedSchemaType>(
  FullTextMigrationFailedCollectionName,
  FullTextMigrationFailedSchema
);
