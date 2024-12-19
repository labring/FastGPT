import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import { SystemTemplateSchemaType } from './type';
const { Schema } = connectionMongo;

export const collectionName = 'app_system_templates';

const SystemTemplateSchema = new Schema({
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
    type: Number
  },
  workflow: {
    type: Object
  }
});

SystemTemplateSchema.index({ templateId: 1 });

export const MongoSystemTemplate = getMongoModel<SystemTemplateSchemaType>(
  collectionName,
  SystemTemplateSchema
);
