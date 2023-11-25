import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { cut, extract } from '@node-rs/jieba';

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

export function jiebaSplit({ text }: { text: string }) {
  const tokens = cut(text, true);

  return tokens
    .map((item) => item.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '').trim())
    .filter(Boolean)
    .join(' ');
}
