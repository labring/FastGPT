import { defineIndex, Schema, getMongoModel } from '../../mongo';
import { type S3TtlSchemaType } from '@fastgpt/global/common/file/s3TTL/type';

const collectionName = 's3_ttls';

const S3MultipartTTLSchema = new Schema(
  {
    uploadId: {
      type: String,
      required: true,
      trim: true
    },
    objectMarker: {
      type: String,
      required: false,
      trim: true
    },
    totalSize: {
      type: Number,
      required: false,
      min: 1
    }
  },
  { _id: false }
);

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
  },
  datasetInlineImage: {
    type: new Schema(
      {
        teamId: { type: String, required: true },
        datasetId: { type: Schema.Types.ObjectId, required: true },
        cleanupPending: { type: Boolean, default: false }
      },
      { _id: false }
    ),
    required: false
  },
  multipart: {
    type: S3MultipartTTLSchema,
    required: false
  }
});

// 图片归属查询复用过期扫描和 bucket/key 索引。
defineIndex(S3TTLSchema, { key: { expiredTime: 1 } });
defineIndex(S3TTLSchema, { key: { bucketName: 1, minioKey: 1 } });

export const MongoS3TTL = getMongoModel<S3TtlSchemaType>(collectionName, S3TTLSchema);
