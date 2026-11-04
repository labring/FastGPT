import { defineIndex, connectionMongo, getMongoModel } from '../../common/mongo';
const { Schema } = connectionMongo;
import { type OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

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
    type: {
      type: String,
      enum: Object.values(ApiKeyTypeEnum)
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

defineIndex(OpenApiSchema, { key: { teamId: 1 } });
defineIndex(OpenApiSchema, { key: { apiKey: 1 } });
defineIndex(OpenApiSchema, {
  key: { teamId: 1, tmbId: 1, tagIds: 1, _id: -1 }
});
defineIndex(OpenApiSchema, {
  key: { teamId: 1, tmbId: 1, appId: 1, _id: -1 }
});
defineIndex(OpenApiSchema, { key: { teamId: 1, tmbId: 1, name: 1 } });
// 应用 Key 列表跨归属成员查询，不能依赖以 tmbId 为前缀的个人索引。
defineIndex(OpenApiSchema, { key: { teamId: 1, type: 1, appId: 1, _id: -1 } });

export const MongoOpenApi = getMongoModel<OpenApiSchema>('openapi', OpenApiSchema);
