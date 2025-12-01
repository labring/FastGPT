import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { CountLimitType } from './type';

const { Schema } = connectionMongo;

const collectionName = 'count_limits';
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
  }
});

try {
  CountLimitSchema.index({ type: 1 });
  CountLimitSchema.index({ type: 1, key: 1 }, { unique: true });
} catch (error) {
  console.log(error);
}

export const MongoCountLimit = getMongoModel<CountLimitType>(collectionName, CountLimitSchema);
