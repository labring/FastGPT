import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;
import type { SystemPluginToolCollectionType } from '@fastgpt/global/core/plugin/tool/type';

export const collectionName = 'system_plugin_tools';

const SystemToolSchema = new Schema({
  pluginId: {
    type: String,
    required: true
  },
  status: {
    type: Number,
    default: 1
  },
  defaultInstalled: {
    type: Boolean,
    default: false
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
  inputConfig: Array,
  isActive: Boolean
});

SystemToolSchema.index({ pluginId: 1 });

export const MongoSystemTool = getMongoModel<SystemPluginToolCollectionType>(
  collectionName,
  SystemToolSchema
);
