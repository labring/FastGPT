import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { PluginItemSchema } from '@fastgpt/global/core/plugin/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const PluginCollectionName = 'plugins';

const PluginSchema = new Schema({
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
  PluginSchema.index({ tmbId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoPlugin: Model<PluginItemSchema> =
  models[PluginCollectionName] || model(PluginCollectionName, PluginSchema);
MongoPlugin.syncIndexes();
