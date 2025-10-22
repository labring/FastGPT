import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import type { TeamInstalledPluginSchemaType } from './type';
const { Schema } = connectionMongo;

export const collectionName = 'team_installed_plugins';

const TeamInstalledPluginSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: 'teams',
    required: true
  },
  pluginId: {
    type: String,
    required: true
  },
  installed: {
    type: Boolean,
    required: true,
    default: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

TeamInstalledPluginSchema.index({ teamId: 1, pluginId: 1 }, { unique: true });
TeamInstalledPluginSchema.index({ teamId: 1 });

export const MongoTeamInstalledPlugin = getMongoModel<TeamInstalledPluginSchemaType>(
  collectionName,
  TeamInstalledPluginSchema
);
