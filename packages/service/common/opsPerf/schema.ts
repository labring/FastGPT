import {
  OpsPerfDomainValues,
  OpsPerfErrorCodeValues,
  OpsPerfEventReasonValues,
  OpsPerfEventStatusValues,
  OpsPerfGranularityValues
} from '@fastgpt/global/common/opsPerf/constants';
import type { OpsPerfBucketType, OpsPerfEventType } from '@fastgpt/global/common/opsPerf/type';
import { defineIndex, getMongoLogModel, Schema } from '../mongo';

export const OpsPerfBucketCollectionName = 'ops_perf_buckets';
export const OpsPerfEventCollectionName = 'ops_perf_events';

/**
 * 通用运维性能按小时预聚合桶 Schema（落 connectionLogMongo）。
 *
 * 公共索引维度强声明；领域差异字段（dims / stages / metrics）统一声明为 Object（Mixed），
 * 读写边界由 packages/global/common/opsPerf/type.ts 的 Zod discriminatedUnion 保证类型安全，
 * 避免跨 domain bulkWrite 点路径 $inc 触发 strictQuery 限制，也使后续新增性能域零改表。
 */
const OpsPerfBucketSchema = new Schema({
  schemaVersion: {
    type: Number,
    default: 1
  },
  domain: {
    type: String,
    required: true,
    enum: OpsPerfDomainValues
  },
  granularity: {
    type: String,
    required: true,
    enum: OpsPerfGranularityValues,
    default: '1h'
  },
  bucketTime: {
    type: Date,
    required: true
  },
  expireAt: {
    type: Date,
    required: true
  },
  dimKey: {
    type: String,
    required: true
  },
  dims: {
    type: Object,
    default: {}
  },
  total: {
    count: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    sumMs: { type: Number, default: 0 },
    maxMs: { type: Number, default: 0 },
    hist: { type: Object, default: {} }
  },
  stages: {
    type: Object,
    default: {}
  },
  metrics: {
    type: Object,
    default: {}
  }
});

// 多 Pod 原子 upsert 唯一键：按领域、粒度、整点桶与规范化维度键精确定位
defineIndex(OpsPerfBucketSchema, {
  key: { domain: 1, granularity: 1, bucketTime: 1, dimKey: 1 },
  options: { unique: true }
});
// 看板按领域 + 时间范围扫描聚合桶
defineIndex(OpsPerfBucketSchema, {
  key: { domain: 1, granularity: 1, bucketTime: -1 }
});
// 按文档独立 expireAt 自动清理过期桶，后续不同 domain/granularity 可配置不同保留期
defineIndex(OpsPerfBucketSchema, {
  key: { expireAt: 1 },
  options: { expireAfterSeconds: 0 }
});

export const MongoOpsPerfBucket = getMongoLogModel<OpsPerfBucketType>(
  OpsPerfBucketCollectionName,
  OpsPerfBucketSchema
);

/**
 * 通用运维性能单点样本 Schema（落 connectionLogMongo）。
 *
 * 记录失败、降级以及低比例正常采样点位，用于单次检索阶段瀑布图排查。
 * 严格脱敏，不存储用户原始查询文本或知识库分块正文。
 */
const OpsPerfEventSchema = new Schema({
  schemaVersion: {
    type: Number,
    default: 1
  },
  domain: {
    type: String,
    required: true,
    enum: OpsPerfDomainValues
  },
  createTime: {
    type: Date,
    required: true
  },
  expireAt: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: OpsPerfEventReasonValues
  },
  status: {
    type: String,
    required: true,
    enum: OpsPerfEventStatusValues
  },
  errorCode: {
    type: String,
    enum: OpsPerfErrorCodeValues
  },
  teamId: {
    type: Schema.Types.ObjectId
  },
  resourceIds: {
    type: [String],
    default: []
  },
  totalMs: {
    type: Number,
    required: true,
    min: 0
  },
  dims: {
    type: Object,
    default: {}
  },
  stages: {
    type: Object,
    default: {}
  },
  detail: {
    type: Object,
    default: {}
  }
});

// 默认时间倒序查询
defineIndex(OpsPerfEventSchema, {
  key: { domain: 1, createTime: -1 }
});
// 按留痕原因（error/degraded/sample）过滤排查
defineIndex(OpsPerfEventSchema, {
  key: { domain: 1, reason: 1, createTime: -1 }
});
// 按资源 ID（如 datasetId，multikey 覆盖多知识库检索）定位单次检索历史
defineIndex(OpsPerfEventSchema, {
  key: { domain: 1, resourceIds: 1, createTime: -1 }
});
// 按团队维度下钻排查
defineIndex(OpsPerfEventSchema, {
  key: { domain: 1, teamId: 1, createTime: -1 }
});
// TTL 自动过期索引（默认 7 天）
defineIndex(OpsPerfEventSchema, {
  key: { expireAt: 1 },
  options: { expireAfterSeconds: 0 }
});

export const MongoOpsPerfEvent = getMongoLogModel<OpsPerfEventType>(
  OpsPerfEventCollectionName,
  OpsPerfEventSchema
);
