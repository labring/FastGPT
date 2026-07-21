import { defineIndex, Schema, getMongoModel } from '../../mongo';
import { type S3TtlSchemaType } from '@fastgpt/global/common/file/s3TTL/type';

const collectionName = 's3_ttls';

const S3TTLSchema = new Schema({
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

defineIndex(S3TTLSchema, { key: { expiredTime: 1 } });
defineIndex(S3TTLSchema, { key: { bucketName: 1, minioKey: 1 } });

export const MongoS3TTL = getMongoModel<S3TtlSchemaType>(collectionName, S3TTLSchema);
