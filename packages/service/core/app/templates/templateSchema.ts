import { AppTemplateSchemaType } from '@fastgpt/global/core/app/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;

export const collectionName = 'app_templates';

const AppTemplateSchema = new Schema({
  templateId: {
    type: String,
    required: true
  },
  name: {
    type: String
  },
  intro: {
    type: String
  },
  avatar: {
    type: String
  },
  tags: {
    type: [String],
    default: undefined
  },
  type: {
    type: String
  },
  isActive: {
    type: Boolean
  },
  userGuide: {
    type: Object
  },
  isQuickTemplate: {
    type: Boolean
  },
  order: {
    type: Number,
    default: -1
  },
  workflow: {
    type: Object
  }
});

AppTemplateSchema.index({ templateId: 1 });

export const MongoAppTemplate = getMongoModel<AppTemplateSchemaType>(
  collectionName,
  AppTemplateSchema
);
