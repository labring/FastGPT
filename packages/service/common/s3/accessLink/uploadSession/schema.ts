import { getLogger, LogCategories } from '../../../logger';
import { getMongoModel, Schema } from '../../../mongo';
import type { S3UploadSessionType } from '../type';

export const S3UploadSessionCollectionName = 's3_upload_sessions';

const logger = getLogger(LogCategories.INFRA.MONGO);

const S3UploadSessionMongoSchema = new Schema({
  tokenHash: {
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
  maxSize: {
    type: Number,
    required: true
  },
  uploadConstraints: {
    type: Object,
    required: true
  },
  metadata: Object,
  createTime: {
    type: Date,
    default: () => new Date()
  },
  expiresAt: {
    type: Date,
    required: true
  },
  usedAt: Date,
  revokedAt: Date
});

try {
  S3UploadSessionMongoSchema.index({ tokenHash: 1 }, { unique: true });
  S3UploadSessionMongoSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  S3UploadSessionMongoSchema.index({ bucketName: 1, objectKey: 1 });
} catch (error) {
  logger.error('Failed to build S3 upload session indexes', { error });
}

export const MongoS3UploadSession = getMongoModel<S3UploadSessionType>(
  S3UploadSessionCollectionName,
  S3UploadSessionMongoSchema
);
