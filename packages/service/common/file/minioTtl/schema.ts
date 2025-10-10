import { Schema, getMongoModel } from '../../../common/mongo';
import { type MinioTtlSchemaType } from '@fastgpt/global/common/file/minioTtl/type.d';

const collectionName = 'minio_ttl_files';

const MinioTtlSchema = new Schema({
  bucketName: {
    type: String,
    required: true
  },
  minioKey: {
    type: String,
    required: true
  },
  expiredTime: {
    type: Date
  }
});

try {
  MinioTtlSchema.index({ expiredTime: 1 });
  MinioTtlSchema.index({ bucketName: 1, minioKey: 1 });
} catch (error) {
  console.log(error);
}

export const MongoMinioTtl = getMongoModel<MinioTtlSchemaType>(collectionName, MinioTtlSchema);
