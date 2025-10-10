import { Schema, getMongoModel } from '../../mongo';
import { type S3TtlSchemaType } from '@fastgpt/global/common/file/minioTtl/type';

const collectionName = 's3_ttl_files';

const S3TtlSchema = new Schema({
  bucketName: {
    type: String,
    required: true
  },
  minioKey: {
    type: String,
    required: true
  },
  expiredTime: {
    type: Date,
    required: true
  }
});

S3TtlSchema.index({ expiredTime: 1 });
S3TtlSchema.index({ bucketName: 1, minioKey: 1 });

export const MongoS3TTL = getMongoModel<S3TtlSchemaType>(collectionName, S3TtlSchema);
