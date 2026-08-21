import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { SystemModelSchemaType } from '../type';

const SystemModelSchema = new Schema(
  {
    model: {
      type: String,
      required: true
    },
    metadata: {
      type: Object,
      required: true,
      default: {}
    }
  },
  {
    minimize: false
  }
);

defineIndex(SystemModelSchema, {
  key: { model: 1 },
  options: { unique: true }
});

export const MongoSystemModel = getMongoModel<SystemModelSchemaType>(
  'system_models',
  SystemModelSchema
);
