import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import { UserTagsEnum } from '@fastgpt/global/support/user/type';
const { Schema } = connectionMongo;

export const collectionName = 'app_templates';

const AppTemplateSchema = new Schema({
  templateId: {
    type: String,
    required: true
  },
  name: String,
  intro: String,
  avatar: String,
  author: String,
  tags: {
    type: [String],
    default: undefined
  },
  type: String,
  isActive: Boolean,
  isPromoted: Boolean,
  promoteTags: {
    type: [String],
    enum: UserTagsEnum.enum
  },
  hideTags: {
    type: [String],
    enum: UserTagsEnum.enum
  },
  recommendText: String,
  userGuide: Object,
  isQuickTemplate: Boolean,
  order: {
    type: Number,
    default: -1
  },
  workflow: Object
});

AppTemplateSchema.index({ templateId: 1 });

export const MongoAppTemplate = getMongoModel<AppTemplateSchemaType>(
  collectionName,
  AppTemplateSchema
);
