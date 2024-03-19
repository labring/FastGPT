import { PluginTypeEnum } from '@fastgpt/global/core/plugin/constants';
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
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user'
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
    enum: Object.keys(PluginTypeEnum),
    required: true,
    default: PluginTypeEnum.plugin
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
  schema: {
    type: String,
    default: null
  },
  authMethod: {
    type: Object,
    default: null
  }
});

try {
  PluginSchema.index({ tmbId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoPlugin: Model<PluginItemSchema> =
  models[PluginCollectionName] || model(PluginCollectionName, PluginSchema);
MongoPlugin.syncIndexes();
