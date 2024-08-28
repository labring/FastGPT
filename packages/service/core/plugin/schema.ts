import { pluginTypeMap } from '@fastgpt/global/core/plugin/constants';
import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { PluginItemSchema } from '@fastgpt/global/core/plugin/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const PluginCollectionName = 'plugins';

const PluginSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: PluginCollectionName,
    default: null
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  type: {
    type: String,
    enum: Object.keys(pluginTypeMap),
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
  },
  edges: {
    type: Array,
    default: []
  },
  metadata: {
    type: {
      pluginUid: String,
      apiSchemaStr: String,
      customHeaders: String
    }
  },
  version: {
    type: String,
    enum: ['v1', 'v2']
  },
  nodeVersion: {
    type: String,
    default: ''
  },

  inited: Boolean
});

try {
  PluginSchema.index({ type: 1, init: 1 });
  PluginSchema.index({ teamId: 1, parentId: 1 });
  PluginSchema.index({ teamId: 1, name: 1, intro: 1 });
} catch (error) {
  console.log(error);
}

export const MongoPlugin: Model<PluginItemSchema> =
  models[PluginCollectionName] || model(PluginCollectionName, PluginSchema);
MongoPlugin.syncIndexes();
