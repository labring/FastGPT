import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;
import type { SystemPluginConfigSchemaType } from './type';

export const collectionName = 'app_system_plugins';

const SystemPluginSchema = new Schema({
  pluginId: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    required: true
  },
  inputConfig: {
    type: Array,
    default: []
  },
  originCost: {
    type: Number,
    default: 0
  },
  currentCost: {
    type: Number,
    default: 0
  },
  customConfig: Object
});

SystemPluginSchema.index({ pluginId: 1 });

export const MongoSystemPluginSchema = getMongoModel<SystemPluginConfigSchemaType>(
  collectionName,
  SystemPluginSchema
);
