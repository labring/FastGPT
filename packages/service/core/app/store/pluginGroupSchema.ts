import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import { PluginGroupSchemaType, TGroupType } from './type';
const { Schema } = connectionMongo;

export const collectionName = 'app_store_groups';

const PluginGroupSchema = new Schema({
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

PluginGroupSchema.index({ groupName: 1 });

export const MongoPluginGroupsSchema = getMongoModel<PluginGroupSchemaType>(
  collectionName,
  PluginGroupSchema
);
