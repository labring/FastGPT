import { connectionMongo, getMongoModel } from '../../mongo';
const { Schema } = connectionMongo;
import { type TimerLockSchemaType } from './type.d';
import { getLogger, LogCategories } from '../../logger';

export const collectionName = 'system_timer_locks';
const logger = getLogger(LogCategories.INFRA.MONGO);

const TimerLockSchema = new Schema({
  timerId: {
    type: String,
    required: true,
    unique: true
  },
  expiredTime: {
    type: Date,
    required: true
  }
});

try {
  TimerLockSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 5 });
} catch (error) {
  logger.error('Failed to build timer lock indexes', { error });
}

export const MongoTimerLock = getMongoModel<TimerLockSchemaType>(collectionName, TimerLockSchema);
