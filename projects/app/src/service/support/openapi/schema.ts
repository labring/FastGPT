import { Schema, model, models, Model } from 'mongoose';
import { OpenApiSchema } from '@/types/support/openapi';
import { PRICE_SCALE } from '@fastgpt/common/bill/constants';
import { formatPrice } from '@fastgpt/common/bill/index';

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

export const OpenApi: Model<OpenApiSchema> = models['openapi'] || model('openapi', OpenApiSchema);
