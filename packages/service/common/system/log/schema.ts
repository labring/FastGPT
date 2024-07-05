import { getMongoModel, Schema } from '../../../common/mongo';
import { SystemLogType } from './type';
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

  SystemLogSchema.index({ time: 1 }, { expires: '15d' });
  SystemLogSchema.index({ level: 1 });

  return getMongoModel<SystemLogType>(LogCollectionName, SystemLogSchema);
};
