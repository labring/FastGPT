import { Types, connectionMongo, ReadPreference } from '../../mongo';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoChatFileSchema, MongoDatasetFileSchema, MongoEvaluationFileSchema } from './schema';
import { addLog } from '../../system/log';

export function getGFSCollection(bucket: `${BucketNameEnum}`) {
  MongoDatasetFileSchema;
  MongoChatFileSchema;
  MongoEvaluationFileSchema;

  return connectionMongo.connection.db!.collection(`${bucket}.files`);
}

export function getGridBucket(bucket: `${BucketNameEnum}`) {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucket,
    // @ts-ignore
    readPreference: ReadPreference.SECONDARY_PREFERRED // Read from secondary node
  });
}

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

export async function updateGridFSFilename({
  bucketName,
  fileId,
  newFilename
}: {
  bucketName: `${BucketNameEnum}`;
  fileId: string;
  newFilename: string;
}) {
  const collection = getGFSCollection(bucketName);
  const result = await collection.updateOne(
    { _id: new Types.ObjectId(fileId) },
    { $set: { filename: newFilename } }
  );

  if (result.matchedCount === 0) {
    addLog.warn('File not found when updating filename', { fileId, newFilename });
  }

  return result;
}
