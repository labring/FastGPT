import { connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { type OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getLogger, LogCategories } from '../../common/logger';

const OpenApiSchema = new Schema(
  {
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
    appName: {
      type: String
    },
    tagIds: {
      type: [Schema.Types.ObjectId],
      default: []
    },
    authProxy: {
      type: Boolean,
      default: false
    },
    name: {
      type: String,
      default: 'Api Key',
      maxlength: 50
    },
    usagePoints: {
      type: Number,
      default: 0
    },
    limit: {
      expiredTime: {
        type: Date
      },
      maxUsagePoints: {
        type: Number,
        default: -1
      }
    }
  },
  {
    toObject: { getters: true }
  }
);

try {
  OpenApiSchema.index({ teamId: 1 });
  OpenApiSchema.index({ apiKey: 1 });
  OpenApiSchema.index({ teamId: 1, tmbId: 1, tagIds: 1, _id: -1 });
  OpenApiSchema.index({ teamId: 1, tmbId: 1, appId: 1, _id: -1 });
  OpenApiSchema.index({ teamId: 1, tmbId: 1, name: 1 });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build OpenAPI indexes', { error });
}

export const MongoOpenApi = getMongoModel<OpenApiSchema>('openapi', OpenApiSchema);
