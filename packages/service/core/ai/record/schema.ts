import { defineIndex, getMongoLogModel, Schema } from '../../../common/mongo';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';

export const LLMRequestRecordCollectionName = 'llm_request_records';

const expiredHours = getSystemInstanceConfig().performance.tracking.retentionHours;

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
  createdAt: {
    type: Date,
    default: () => new Date(),
    expires: expiredHours * 60 * 60 // n hours
  }
});

defineIndex(LLMRequestRecordSchema, {
  key: { teamId: 1, requestId: 1 },
  options: { unique: true }
});

export const MongoLLMRequestRecord = getMongoLogModel<LLMRequestRecordSchemaType>(
  LLMRequestRecordCollectionName,
  LLMRequestRecordSchema
);
