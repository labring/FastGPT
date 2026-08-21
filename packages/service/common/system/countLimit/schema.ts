import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import type { CountLimitType } from './type';
import { getLogger, LogCategories } from '../../logger';

const { Schema } = connectionMongo;

const collectionName = 'system_count_limits';
const logger = getLogger(LogCategories.INFRA.MONGO);
const CountLimitSchema = new Schema({
  key: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  count: {
    type: Number,
    required: true,
    default: 0
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

defineIndex(CountLimitSchema, {
  key: { type: 1, key: 1 },
  options: { unique: true }
});
defineIndex(CountLimitSchema, {
  key: { createTime: 1 },
  options: { expireAfterSeconds: 60 * 60 * 24 * 30 }
}); // ttl 30天

export const MongoCountLimit = getMongoModel<CountLimitType>(collectionName, CountLimitSchema);
