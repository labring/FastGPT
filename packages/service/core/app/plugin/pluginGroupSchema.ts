import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import { PluginGroupSchemaType, TGroupType } from './type';
const { Schema } = connectionMongo;

export const collectionName = 'app_plugin_groups';

const PluginGroupSchema = new Schema({
  groupId: {
    type: String,
    required: true
  },
  groupAvatar: {
    type: String,
    default: ''
  },
  groupName: {
    type: String,
    required: true
  },
  groupTypes: {
    type: Array<TGroupType>,
    default: []
  },
  groupOrder: {
    type: Number,
    default: 0
  }
});

PluginGroupSchema.index({ groupId: 1 }, { unique: true });

export const MongoPluginGroups = getMongoModel<PluginGroupSchemaType>(
  collectionName,
  PluginGroupSchema
);
