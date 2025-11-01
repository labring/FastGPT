import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import type { PluginToolTagType } from '@fastgpt/global/core/plugin/type';
const { Schema } = connectionMongo;

export const collectionName = 'system_plugin_tool_tags';

const SystemPluginToolTagSchema = new Schema({
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

SystemPluginToolTagSchema.index({ tagId: 1 }, { unique: true });
SystemPluginToolTagSchema.index({ tagOrder: 1 });

export const MongoPluginToolTag = getMongoModel<PluginToolTagType>(
  collectionName,
  SystemPluginToolTagSchema
);
