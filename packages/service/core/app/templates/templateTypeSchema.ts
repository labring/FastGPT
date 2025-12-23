import { type TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;

export const collectionName = 'app_template_types';

const TemplateTypeSchema = new Schema({
  typeName: {
    type: String,
    required: true
  },
  typeId: {
    type: String,
    required: true
  },
  typeOrder: {
    type: Number,
    default: 0
  }
});

export const MongoTemplateTypes = getMongoModel<TemplateTypeSchemaType>(
  collectionName,
  TemplateTypeSchema
);
