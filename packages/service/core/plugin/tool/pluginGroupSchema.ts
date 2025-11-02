// 已弃用
import type { I18nStringStrictType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;

export const collectionName = 'app_plugin_groups';

export type TGroupType = {
  typeName: I18nStringStrictType | string;
  typeId: string;
};
export type SystemToolGroupSchemaType = {
  groupId: string;
  groupAvatar: string;
  groupName: string;
  groupTypes: TGroupType[];
  groupOrder: number;
};

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

export const MongoToolGroups = getMongoModel<SystemToolGroupSchemaType>(
  collectionName,
  PluginGroupSchema
);
