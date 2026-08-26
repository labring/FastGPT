import { connectionMongo, defineIndex, getMongoModel } from '../../../common/mongo';
import { SystemModelCollectionName } from './constants';
const { Schema } = connectionMongo;
import type { SystemModelSchemaType } from '../type';

const SystemModelSchema = new Schema(
  {
    model: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    provider: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    isSystem: {
      type: Boolean,
      required: true,
      default: true
    },
    isActive: Boolean,
    isDefault: Boolean,
    isDefaultDatasetTextModel: Boolean,
    isDefaultDatasetImageModel: Boolean,
    isDefaultChatTitleModel: Boolean,
    requestUrl: String,
    requestAuth: String,
    testMode: Boolean,
    charsPointsPrice: Number,
    priceTiers: [
      {
        _id: false,
        minInputTokens: Number,
        maxInputTokens: Number,
        inputPrice: Number,
        outputPrice: Number
      }
    ],
    inputPrice: Number,
    outputPrice: Number,
    config: {
      type: Schema.Types.Mixed,
      required: true,
      default: {}
    }
  },
  {
    minimize: false
  }
);

defineIndex(SystemModelSchema, {
  key: { isSystem: 1, model: 1 },
  options: {
    unique: true,
    partialFilterExpression: { isSystem: true }
  }
});

defineIndex(SystemModelSchema, {
  key: { model: 1 },
  options: { unique: true },
  deprecated: true
});

export const MongoSystemModel = getMongoModel<SystemModelSchemaType>(
  SystemModelCollectionName,
  SystemModelSchema
);
