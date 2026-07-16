import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import type { TeamPluginTagSchemaType } from '@fastgpt/global/core/plugin/schema/type';

const { Schema } = connectionMongo;

export const collectionName = 'team_plugin_tags';

const TeamPluginTagSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tagId: {
    type: String,
    required: true
  },
  tagName: {
    type: String,
    required: true
  },
  tagOrder: {
    type: Number,
    default: 0
  },
  color: String,
  createTime: {
    type: Date,
    default: Date.now
  },
  updateTime: {
    type: Date,
    default: Date.now
  }
});

TeamPluginTagSchema.index({ teamId: 1, tagId: 1 }, { unique: true });
TeamPluginTagSchema.index({ teamId: 1, tagOrder: 1 });

export const MongoTeamPluginTag = getMongoModel<TeamPluginTagSchemaType>(
  collectionName,
  TeamPluginTagSchema
);
