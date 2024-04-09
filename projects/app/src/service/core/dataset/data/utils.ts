import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

/**
 * Same value judgment
 */
export async function hasSameValue({
  teamId,
  datasetId,
  collectionId,
  q,
  a = ''
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  q: string;
  a?: string;
}) {
  const count = await MongoDatasetData.countDocuments({
    teamId,
    datasetId,
    collectionId,
    q,
    a
  });

  if (count > 0) {
    return Promise.reject('已经存在完全一致的数据');
  }
}
