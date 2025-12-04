import { Types, connectionMongo, ReadPreference } from '../../mongo';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoChatFileSchema, MongoDatasetFileSchema } from './schema';

// FIXME: 兼容 `initv4143` 迁移数据
export function getGFSCollection(bucket: `${BucketNameEnum}`) {
  MongoDatasetFileSchema;
  MongoChatFileSchema;

  return connectionMongo.connection.db!.collection(`${bucket}.files`);
}

// FIXME: 兼容 `initv4143` 迁移数据
export function getGridBucket(bucket: `${BucketNameEnum}`) {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucket,
    // @ts-ignore
    readPreference: ReadPreference.SECONDARY_PREFERRED // Read from secondary node
  });
}

// FIXME: 兼容 `initv4143` 迁移数据
export async function getDownloadStream({
  bucketName,
  fileId
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
}) {
  const bucket = getGridBucket(bucketName);

  return bucket.openDownloadStream(new Types.ObjectId(fileId));
}
