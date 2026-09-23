import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import type { ModelStatusProbeRecordType } from './type';

const { Schema } = connectionMongo;

/** 存储单次探测记录的 MongoDB 集合名 */
export const ModelStatusProbeRecordCollectionName = 'model_status_probe_records';

/**
 * 模型状态探测历史记录 Mongoose Schema。
 * 每次对单个模型发起探测后记录其健康状态、响应耗时、重试次数和错误详情。
 */
const ModelStatusProbeRecordSchema = new Schema({
  modelId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  model: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(ModelTypeEnum),
    required: true
  },
  status: {
    type: String,
    enum: ['green', 'yellow', 'red'],
    required: true
  },
  latencyMs: {
    type: Number,
    min: 0
  },
  attempts: {
    type: Number,
    min: 1,
    max: 4,
    required: true
  },
  error: {
    type: String
  },
  startedAt: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  requestStartedAt: {
    type: Date,
    required: true
  },
  requestEndedAt: {
    type: Date,
    required: true
  }
});

/** 按 modelId 与请求结束时间逆序索引，加速查询单个模型最近 48 小时的探测时间线 */
defineIndex(ModelStatusProbeRecordSchema, {
  key: { modelId: 1, requestEndedAt: -1 }
});
/** TTL 自动过期索引：探测历史记录保留 30 天，超时后由 MongoDB 自动清理，避免数据无限膨胀 */
defineIndex(ModelStatusProbeRecordSchema, {
  key: { requestEndedAt: 1 },
  options: { expireAfterSeconds: 30 * 24 * 60 * 60 }
});

/** 清理旧版探测记录按 testedAt 创建的查询索引。 */
defineIndex(ModelStatusProbeRecordSchema, {
  key: { modelId: 1, testedAt: -1 },
  deprecated: true
});
/** 清理旧版探测记录基于 testedAt 的 30 天 TTL 索引。 */
defineIndex(ModelStatusProbeRecordSchema, {
  key: { testedAt: 1 },
  options: { expireAfterSeconds: 30 * 24 * 60 * 60 },
  deprecated: true
});

/** 模型探测历史记录 MongoDB 操作模型 */
export const MongoModelStatusProbeRecord = getMongoModel<ModelStatusProbeRecordType>(
  ModelStatusProbeRecordCollectionName,
  ModelStatusProbeRecordSchema
);
