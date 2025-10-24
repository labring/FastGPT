import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import type { PluginTagSchemaType } from './type';
const { Schema } = connectionMongo;

export const collectionName = 'app_plugin_tags';

const PluginTagSchema = new Schema({
  tagId: {
    type: String,
    required: true
  },
  tagName: {
    type: Schema.Types.Mixed,
    required: true
  },
  tagOrder: {
    type: Number,
    default: 0
  },
  isSystem: {
    type: Boolean,
    default: false
  }
});

PluginTagSchema.index({ tagId: 1 }, { unique: true });
PluginTagSchema.index({ tagOrder: 1 });

export const MongoPluginTag = getMongoModel<PluginTagSchemaType>(collectionName, PluginTagSchema);
