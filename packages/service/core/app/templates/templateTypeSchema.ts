import { type TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
import { UserTagsEnum } from '@fastgpt/global/support/user/type';
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
  },
  promoteTags: {
    type: [String],
    enum: UserTagsEnum.enum
  },
  hideTags: {
    type: [String],
    enum: UserTagsEnum.enum
  }
});

export const MongoTemplateTypes = getMongoModel<TemplateTypeSchemaType>(
  collectionName,
  TemplateTypeSchema
);
