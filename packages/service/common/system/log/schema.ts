import { defineIndex, getMongoLogModel as getMongoModel, Schema } from '../../../common/mongo';
import { type SystemLogType } from './type';
import { LogLevelEnum } from './constant';

export const LogCollectionName = 'system_logs';

export const getMongoLog = () => {
  const SystemLogSchema = new Schema({
    text: {
      type: String,
      required: true
    },
    level: {
      type: String,
      required: true,
      enum: Object.values(LogLevelEnum)
    },
    time: {
      type: Date,
      default: () => new Date()
    },
    metadata: Object
  });

  defineIndex(SystemLogSchema, {
    key: { time: 1 },
    options: { expires: '15d' }
  });
  defineIndex(SystemLogSchema, { key: { level: 1 } });

  return getMongoModel<SystemLogType>(LogCollectionName, SystemLogSchema);
};
