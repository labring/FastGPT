import { getMongoModel, Schema } from '../../mongo';
import { SystemInfoSchemaType } from './type';
export const SystemInfoCollectionName = 'system_infos';

const SystemInfoSchema = new Schema({
  version: {
    type: String
  },
  initScript: {
    type: String
  },
  updateTime: {
    type: Date,
    default: Date.now
  },
  lock: {
    type: Boolean,
    default: false
  }
});

export const MongoSystemInfo = getMongoModel<SystemInfoSchemaType>(
  SystemInfoCollectionName,
  SystemInfoSchema
);
