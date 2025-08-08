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
    type: Boolean
  },
  originCost: {
    type: Number,
    default: 0
  },
  currentCost: {
    type: Number,
    default: 0
  },
  hasTokenFee: {
    type: Boolean,
    default: false
  },
  pluginOrder: {
    type: Number
  },
  systemKeyCost: {
    type: Number,
    default: 0
  },
  customConfig: Object,
  inputListVal: Object,

  // @deprecated
  inputConfig: Array
});

SystemPluginSchema.index({ pluginId: 1 });

export const MongoSystemPlugin = getMongoModel<SystemPluginConfigSchemaType>(
  collectionName,
  SystemPluginSchema
);
