import { bucketName, MongoDatasetImageSchema } from './schema';
import { connectionMongo, Types } from '../../../common/mongo';
import { UserError } from '@fastgpt/global/common/error/utils';
import type { Readable } from 'node:stream';

const getGridBucket = () => {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucketName
  });
};

export const getDatasetImageReadData = async (
  imageId: string
): Promise<{
  stream: Readable;
  fileInfo: Record<string, unknown>;
}> => {
  // Get file metadata to get contentType
  const fileInfo = await MongoDatasetImageSchema.findOne({
    _id: new Types.ObjectId(imageId)
  }).lean();
  if (!fileInfo) {
    return Promise.reject(new UserError('Image not found'));
  }

  const gridBucket = getGridBucket();
  return {
    stream: gridBucket.openDownloadStream(new Types.ObjectId(imageId)),
    fileInfo: fileInfo as unknown as Record<string, unknown>
  };
};
