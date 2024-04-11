import { DatasetDataItemType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';
import { AuthModeType } from '@fastgpt/service/support/permission/type';

/* data permission same of collection */
export async function authDatasetData({
  dataId,
  ...props
}: AuthModeType & {
  dataId: string;
}) {
  // get mongo dataset.data
  const datasetData = await MongoDatasetData.findById(dataId);

  if (!datasetData) {
    return Promise.reject('core.dataset.error.Data not found');
  }

  const result = await authDatasetCollection({
    ...props,
    collectionId: datasetData.collectionId
  });

  const data: DatasetDataItemType = {
    id: String(datasetData._id),
    teamId: datasetData.teamId,
    q: datasetData.q,
    a: datasetData.a,
    chunkIndex: datasetData.chunkIndex,
    indexes: datasetData.indexes,
    datasetId: String(datasetData.datasetId),
    collectionId: String(datasetData.collectionId),
    sourceName: result.collection.name || '',
    sourceId: result.collection?.fileId || result.collection?.rawLink,
    isOwner: String(datasetData.tmbId) === result.tmbId,
    canWrite: result.canWrite
  };

  return {
    ...result,
    datasetData: data
  };
}
