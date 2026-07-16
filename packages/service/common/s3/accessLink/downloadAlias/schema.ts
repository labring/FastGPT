import { getLogger, LogCategories } from '../../../logger';
import { getMongoModel, Schema } from '../../../mongo';
import type { S3DownloadAliasType } from '../type';

export const S3DownloadAliasCollectionName = 's3_download_aliases';

const logger = getLogger(LogCategories.INFRA.MONGO);

const S3DownloadAliasMongoSchema = new Schema({
  aliasId: {
    type: String,
    required: true
  },
  aliasKey: {
    type: String,
    required: true
  },
  bucketName: {
    type: String,
    required: true
  },
  objectKey: {
    type: String,
    required: true
  },
  filename: String,
  responseContentType: String,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  lastIssuedAt: {
    type: Date,
    required: true
  },
  purgeAt: {
    type: Date,
    required: true
  },
  disabledAt: Date
});

try {
  S3DownloadAliasMongoSchema.index({ aliasId: 1 }, { unique: true });
  S3DownloadAliasMongoSchema.index({ aliasKey: 1 }, { unique: true });
  S3DownloadAliasMongoSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
  S3DownloadAliasMongoSchema.index({ bucketName: 1, objectKey: 1 });
} catch (error) {
  logger.error('Failed to build S3 download alias indexes', { error });
}

export const MongoS3DownloadAlias = getMongoModel<S3DownloadAliasType>(
  S3DownloadAliasCollectionName,
  S3DownloadAliasMongoSchema
);
