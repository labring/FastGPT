import { connectionMongo, getMongoModel, type Model } from '../../mongo';
import { timerIdMap } from './constants';
const { Schema, model, models } = connectionMongo;
import { TimerLockSchemaType } from './type.d';

export const collectionName = 'systemtimerlocks';

const TimerLockSchema = new Schema({
  timerId: {
    type: String,
    required: true,
    unique: true,
    enum: Object.keys(timerIdMap)
  },
  expiredTime: {
    type: Date,
    required: true
  }
});

try {
  TimerLockSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 5 });
} catch (error) {
  console.log(error);
}

export const MongoTimerLock = getMongoModel<TimerLockSchemaType>(collectionName, TimerLockSchema);
