import { bucketName, MongoDatasetImageSchema, type DatasetImageSchemaType } from './schema';
import { connectionMongo, Types, type MongoGridFSBucketReadStream } from '../../../common/mongo';
import { UserError } from '@fastgpt/global/common/error/utils';

const getGridBucket = () => {
  return new connectionMongo.mongo.GridFSBucket(connectionMongo.connection.db!, {
    bucketName: bucketName
  });
};

export const getDatasetImageReadData = async (
  imageId: string
): Promise<{
  stream: MongoGridFSBucketReadStream;
  fileInfo: DatasetImageSchemaType;
}> => {
  // Get file metadata to get contentType
  const fileInfo = await MongoDatasetImageSchema.findOne({
    _id: new Types.ObjectId(imageId)
  }).lean<DatasetImageSchemaType>();
  if (!fileInfo) {
    return Promise.reject(new UserError('Image not found'));
  }

  const gridBucket = getGridBucket();
  return {
    stream: gridBucket.openDownloadStream(new Types.ObjectId(imageId)),
    fileInfo
  };
};
