import { getMongoLogModel, Schema } from '../../../common/mongo';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

export const LLMRequestRecordCollectionName = 'llm_request_records';

const expiredHours = process.env.LLM_REQUEST_TRACKING_RETENTION_HOURS
  ? Number(process.env.LLM_REQUEST_TRACKING_RETENTION_HOURS)
  : 6;

const LLMRequestRecordSchema = new Schema({
  requestId: {
    type: String,
    required: true,
    unique: true
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

export const MongoLLMRequestRecord = getMongoLogModel<LLMRequestRecordSchemaType>(
  LLMRequestRecordCollectionName,
  LLMRequestRecordSchema
);
