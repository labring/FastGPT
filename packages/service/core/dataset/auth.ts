import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { MongoDatasetCollection } from './collection/schema';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';

export async function authCollection({
  collectionId,
  userId
}: {
  collectionId: string;
  userId: string;
}) {
  const collection = await MongoDatasetCollection.findOne({
    _id: collectionId,
    userId
  })
    .populate('datasetId')
    .lean();

  if (collection) {
    return {
      ...collection,
      dataset: collection.datasetId as unknown as DatasetSchemaType
    };
  }
  return Promise.reject(ERROR_ENUM.unAuthDataset);
}
