import { defineIndex, getMongoLogModel, Schema } from '../../../common/mongo';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

export const LLMRequestRecordCollectionName = 'llm_request_records';
export const LLMRequestRecordExpiredTimeIndexName = 'fg_llm_req_expired_time';

const LLMRequestRecordSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    required: true
  },
  requestId: {
    type: String,
    required: true
  },
  body: {
    type: Schema.Types.Mixed,
    required: true
  },
  response: {
    type: Schema.Types.Mixed,
    required: true
  },
  expiredTime: {
    type: Date
  }
});

defineIndex(LLMRequestRecordSchema, {
  key: { teamId: 1, requestId: 1 },
  options: { unique: true }
});

// 按文档独立 expiredTime 自动清理过期记录，修改保留时长仅影响后续落库，无需运行时 collMod。
defineIndex(LLMRequestRecordSchema, {
  key: { expiredTime: 1 },
  options: {
    name: LLMRequestRecordExpiredTimeIndexName,
    expireAfterSeconds: 0
  }
});

export const MongoLLMRequestRecord = getMongoLogModel<LLMRequestRecordSchemaType>(
  LLMRequestRecordCollectionName,
  LLMRequestRecordSchema
);
