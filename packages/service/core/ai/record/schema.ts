import { defineIndex, getMongoLogModel, Schema } from '../../../common/mongo';
import type { LLMRequestRecordSchemaType } from '@fastgpt/global/openapi/core/ai/api';

export const LLMRequestRecordCollectionName = 'llm_request_records';

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
    default: () => new Date()
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

/**
 * 配置加载后才声明 TTL，避免模型在启动早期用默认值覆盖数据库的实际保留时间。
 * 保持历史 createdAt_1 名称和 key；更新声明供后续索引同步使用，不重建 Model。
 */
export const configureLLMRequestRecordTTLIndex = (expireAfterSeconds: number) => {
  const schema = MongoLLMRequestRecord.schema;
  const declaration = schema
    .indexes()
    .find(([key]) => Object.keys(key).length === 1 && key.createdAt === 1);

  if (declaration) {
    declaration[1].expireAfterSeconds = expireAfterSeconds;
    return;
  }

  defineIndex(schema, {
    key: { createdAt: 1 },
    options: { name: 'createdAt_1', expireAfterSeconds }
  });
};
