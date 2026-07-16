import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo/index';
import {
  TeamPluginInstallSourceEnum,
  TeamPluginPolicyStatusEnum,
  TeamPluginRegistrySourceEnum,
  type TeamInstalledPluginSchemaType
} from '@fastgpt/global/core/plugin/schema/type';

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
  version: String,
  etag: String,
  registrySource: {
    type: String,
    enum: Object.values(TeamPluginRegistrySourceEnum),
    default: TeamPluginRegistrySourceEnum.team
  },
  installSource: {
    type: String,
    enum: Object.values(TeamPluginInstallSourceEnum)
  },
  status: {
    type: String,
    enum: Object.values(TeamPluginPolicyStatusEnum)
  },
  hidden: {
    type: Boolean,
    default: false
  },
  teamTagIds: {
    type: [String],
    default: []
  },
  packageSource: {
    marketplaceToolId: String,
    marketplaceSource: String,
    downloadUrlHash: String,
    uploadedFileName: String
  },
  confirmedPermissions: {
    type: [String],
    default: []
  },
  permissionsConfirmedAt: Date,
  installedByTmbId: String,
  installedAt: Date,
  updatedByTmbId: String,
  updatedAt: Date,
  deletedByTmbId: String,
  deletedAt: Date,
  hiddenByTmbId: String,
  hiddenAt: Date,
  createTime: {
    type: Date,
    default: Date.now
  },
  updateTime: {
    type: Date,
    default: Date.now
  },
  installed: {
    type: Boolean
  }
});

defineIndex(TeamInstalledPluginSchema, {
  key: { teamId: 1, registrySource: 1, pluginId: 1 },
  options: { unique: true }
});
defineIndex(TeamInstalledPluginSchema, { key: { teamId: 1, status: 1, updateTime: -1 } });
defineIndex(TeamInstalledPluginSchema, { key: { teamId: 1, teamTagIds: 1 } });
defineIndex(TeamInstalledPluginSchema, { key: { teamId: 1, hidden: 1 } });

export const MongoTeamInstalledPlugin = getMongoModel<TeamInstalledPluginSchemaType>(
  collectionName,
  TeamInstalledPluginSchema
);
