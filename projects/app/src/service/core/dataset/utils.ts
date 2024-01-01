import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

/**
 * Same value judgment
 */
export async function hasSameValue({
  collectionId,
  q,
  a = ''
}: {
  collectionId: string;
  q: string;
  a?: string;
}) {
  const count = await MongoDatasetData.countDocuments({
    q,
    a,
    collectionId
  });

  if (count > 0) {
    return Promise.reject('已经存在完全一致的数据');
  }
}
