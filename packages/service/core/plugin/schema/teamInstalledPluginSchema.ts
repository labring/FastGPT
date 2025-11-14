import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import type { TeamInstalledPluginSchemaType } from '@fastgpt/global/core/plugin/schema/type';

const { Schema } = connectionMongo;

export const collectionName = 'team_installed_plugins';

const TeamInstalledPluginSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  pluginType: {
    type: String,
    default: 'tool'
  },
  pluginId: {
    type: String,
    required: true
  },
  installed: {
    type: Boolean,
    required: true
  }
});

TeamInstalledPluginSchema.index({ teamId: 1, pluginId: 1 }, { unique: true });

export const MongoTeamInstalledPlugin = getMongoModel<TeamInstalledPluginSchemaType>(
  collectionName,
  TeamInstalledPluginSchema
);
