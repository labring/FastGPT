import { type AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
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
