import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
import { getLogger, LogCategories } from '../../../common/logger';
import type { OpenApiTagType } from '@fastgpt/global/openapi/support/openapi/tag';

const { Schema } = connectionMongo;

export const OpenApiTagCollectionName = 'openapi_tags';

export type OpenApiTagSchemaType = OpenApiTagType & {
  teamId: string;
  tmbId: string;
  normalizedName: string;
};

const OpenApiTagSchema = new Schema({
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
  name: {
    type: String,
    required: true,
    maxlength: 50
  },
  normalizedName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['system', 'custom'],
    required: true
  },
  order: {
    type: Number,
    default: 100
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  defineIndex(OpenApiTagSchema, {
    key: { teamId: 1, tmbId: 1, normalizedName: 1 },
    options: { unique: true }
  });
  defineIndex(OpenApiTagSchema, {
    key: { teamId: 1, tmbId: 1, type: 1, order: 1 }
  });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build OpenAPI tag indexes', { error });
}

export const MongoOpenApiTag = getMongoModel<OpenApiTagSchemaType>(
  OpenApiTagCollectionName,
  OpenApiTagSchema
);
