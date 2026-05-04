import { getMongoLogModel, Schema } from '../../../common/mongo';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';
import { serviceEnv } from '../../../env';

export const LLMRequestRecordCollectionName = 'llm_request_records';

const expiredHours = serviceEnv.LLM_REQUEST_TRACKING_RETENTION_HOURS;

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
