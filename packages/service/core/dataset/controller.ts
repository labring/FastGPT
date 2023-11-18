import { CollectionWithDatasetType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetCollection } from './collection/schema';
import { MongoDataset } from './schema';

/* ============= dataset ========== */
/* find all datasetId by top datasetId */
export async function findDatasetIdTreeByTopDatasetId(
  id: string,
  result: string[] = []
): Promise<string[]> {
  let allChildrenIds = [...result];

  // find children
  const children = await MongoDataset.find({ parentId: id });

  for (const child of children) {
    const grandChildrenIds = await findDatasetIdTreeByTopDatasetId(child._id, result);
    allChildrenIds = allChildrenIds.concat(grandChildrenIds);
  }

  return [String(id), ...allChildrenIds];
}

export async function getCollectionWithDataset(collectionId: string) {
  const data = (await MongoDatasetCollection.findById(collectionId)
    .populate('datasetId')
    .lean()) as CollectionWithDatasetType;
  if (!data) {
    return Promise.reject('Collection is not exist');
  }
  return data;
}
