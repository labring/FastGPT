import { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';

export async function getCollectionWithDataset(collectionId: string) {
  const data = (
    await MongoDatasetCollection.findById(collectionId).populate('datasetId')
  )?.toJSON() as CollectionWithDatasetType;
  if (!data) {
    return Promise.reject('Collection is not exist');
  }
  return data;
}
