import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { PRICE_SCALE } from '@fastgpt/global/support/wallet/bill/constants';
import { formatStorePrice2Read } from '@fastgpt/global/support/wallet/bill/tools';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

const OpenApiSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'user'
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: TeamCollectionName,
      required: true
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: TeamMemberCollectionName,
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
      get: (val: number) => formatStorePrice2Read(val)
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
        get: (val: number) => formatStorePrice2Read(val)
      }
    }
  },
  {
    toObject: { getters: true }
  }
);

export const MongoOpenApi: Model<OpenApiSchema> =
  models['openapi'] || model('openapi', OpenApiSchema);
MongoOpenApi.syncIndexes();
