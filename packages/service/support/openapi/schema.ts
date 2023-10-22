import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { PRICE_SCALE } from '@fastgpt/global/common/bill/constants';
import { formatPrice } from '@fastgpt/global/common/bill/tools';

const OpenApiSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true
    },
    apiKey: {
      type: String,
      required: true,
      get: (val: string) => `******${val.substring(val.length - 4)}`
    },
    createTime: {
      type: Date,
      default: () => new Date()
    },
    lastUsedTime: {
      type: Date
    },
    appId: {
      type: String,
      required: false
    },
    name: {
      type: String,
      default: 'Api Key'
    },
    usage: {
      // total usage. value from bill total
      type: Number,
      default: 0,
      get: (val: number) => formatPrice(val)
    },
    limit: {
      expiredTime: {
        type: Date
      },
      credit: {
        // value from user settings
        type: Number,
        default: -1,
        set: (val: number) => val * PRICE_SCALE,
        get: (val: number) => formatPrice(val)
      }
    }
  },
  {
    toObject: { getters: true }
  }
);

export const MongoOpenApi: Model<OpenApiSchema> =
  models['openapi'] || model('openapi', OpenApiSchema);
