import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { PluginItemSchema } from '@fastgpt/global/core/plugin/type.d';

export const ModuleCollectionName = 'plugins';

const PluginSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  intro: {
    type: String,
    default: ''
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

try {
  PluginSchema.index({ userId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoPlugin: Model<PluginItemSchema> =
  models[ModuleCollectionName] || model(ModuleCollectionName, PluginSchema);
