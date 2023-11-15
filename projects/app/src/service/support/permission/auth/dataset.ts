import { DatasetDataItemType, DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import { AuthResponseType } from '@fastgpt/global/support/permission/type';
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
  // get pg data
  const datasetData = await MongoDatasetData.findById(dataId);

  if (!datasetData) {
    return Promise.reject('Data not found');
  }

  const result = await authDatasetCollection({
    ...props,
    collectionId: datasetData.collectionId
  });

  const data: DatasetDataItemType = {
    id: String(datasetData._id),
    q: datasetData.q,
    a: datasetData.a,
    indexes: datasetData.indexes,
    datasetId: String(datasetData.datasetId),
    collectionId: String(datasetData.collectionId),
    sourceName: result.collection.name || '',
    sourceId: result.collection.metadata?.fileId || result.collection.metadata?.rawLink,
    isOwner: String(datasetData.tmbId) === result.tmbId,
    canWrite: result.canWrite
  };

  return {
    ...result,
    datasetData: data
  };
}
