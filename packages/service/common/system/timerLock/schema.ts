import { defineIndex, connectionMongo, getMongoModel } from '../../mongo';
const { Schema } = connectionMongo;
import { type TimerLockSchemaType } from './type';
import { getLogger, LogCategories } from '../../logger';

export const collectionName = 'system_timer_locks';
const logger = getLogger(LogCategories.INFRA.MONGO);

const TimerLockSchema = new Schema({
  timerId: {
    type: String,
    required: true
  },
  expiredTime: {
    type: Date,
    required: true
  }
});

defineIndex(TimerLockSchema, {
  key: { timerId: 1 },
  options: { unique: true }
});
defineIndex(TimerLockSchema, {
  key: { expiredTime: 1 },
  options: { expireAfterSeconds: 5 }
});

export const MongoTimerLock = getMongoModel<TimerLockSchemaType>(collectionName, TimerLockSchema);
