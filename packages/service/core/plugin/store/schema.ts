import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { PluginItemSchema } from '@fastgpt/global/core/plugin/type.d';

import { PluginCollectionName } from '../schema';

export const ModuleCollectionName = 'plugins';

const PluginStoreSchema = new Schema({
  pluginId: {
    type: Schema.Types.ObjectId,
    ref: PluginCollectionName,
    required: true
  },
  price: {
    type: Number,
    default: 0
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  modules: {
    type: Array,
    default: []
  }
});

export const MongoPluginStore: Model<PluginItemSchema> =
  models[ModuleCollectionName] || model(ModuleCollectionName, PluginStoreSchema);
MongoPluginStore.syncIndexes();
