import { getMongoLogModel, Schema } from '../../../common/mongo';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

export const LLMRequestRecordCollectionName = 'llm_request_records';

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
    expires: 7 * 24 * 60 * 60 // 7 days
  }
});

export const MongoLLMRequestRecord = getMongoLogModel<LLMRequestRecordSchemaType>(
  LLMRequestRecordCollectionName,
  LLMRequestRecordSchema
);
