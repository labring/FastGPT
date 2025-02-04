import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { SystemModelSchemaType } from '../type';

const SystemModelSchema = new Schema({
  model: {
    type: String,
    required: true,
    unique: true
  },
  metadata: {
    type: Object,
    required: true,
    default: {}
  }
});

export const MongoSystemModel = getMongoModel<SystemModelSchemaType>(
  'system_models',
  SystemModelSchema
);
