import { defineIndex, getMongoModel, Schema } from '../../../mongo';
import type { S3UploadSessionType } from '../type';

export const S3UploadSessionCollectionName = 's3_upload_sessions';

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
  uploadPolicy: {
    type: Object,
    required: true
  },
  fileHint: Object,
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
  revokedAt: Date,
  multipart: {
    type: Object,
    required: false
  }
});

defineIndex(S3UploadSessionMongoSchema, {
  key: { tokenHash: 1 },
  options: { unique: true }
});
defineIndex(S3UploadSessionMongoSchema, {
  key: { expiresAt: 1 },
  options: { expireAfterSeconds: 0 }
});
defineIndex(S3UploadSessionMongoSchema, {
  key: { bucketName: 1, objectKey: 1 }
});

export const MongoS3UploadSession = getMongoModel<S3UploadSessionType>(
  S3UploadSessionCollectionName,
  S3UploadSessionMongoSchema
);
