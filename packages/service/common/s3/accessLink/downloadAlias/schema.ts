import { getLogger, LogCategories } from '../../../logger';
import { defineIndex, getMongoModel, Schema } from '../../../mongo';
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

defineIndex(S3DownloadAliasMongoSchema, {
  key: { aliasId: 1 },
  options: { unique: true }
});
defineIndex(S3DownloadAliasMongoSchema, {
  key: { aliasKey: 1 },
  options: { unique: true }
});
defineIndex(S3DownloadAliasMongoSchema, {
  key: { purgeAt: 1 },
  options: { expireAfterSeconds: 0 }
});
defineIndex(S3DownloadAliasMongoSchema, {
  key: { bucketName: 1, objectKey: 1 }
});

export const MongoS3DownloadAlias = getMongoModel<S3DownloadAliasType>(
  S3DownloadAliasCollectionName,
  S3DownloadAliasMongoSchema
);
