import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { CountLimitType } from './type';

const { Schema } = connectionMongo;

const collectionName = 'system_count_limits';
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

try {
  CountLimitSchema.index({ type: 1, key: 1 }, { unique: true });
  CountLimitSchema.index({ createTime: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }); // ttl 30天
} catch (error) {
  console.log(error);
}

export const MongoCountLimit = getMongoModel<CountLimitType>(collectionName, CountLimitSchema);
