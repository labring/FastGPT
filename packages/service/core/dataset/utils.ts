import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import Papa from 'papaparse';
import { S3Sources } from '../../common/s3/type';
import { getS3DatasetSource, S3DatasetSource } from '../../common/s3/sources/dataset';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { jwtSignS3ObjectKey, isS3ObjectKey } from '../../common/s3/utils';

// TODO: 需要优化成批量获取权限
export const filterDatasetsByTmbId = async ({
  datasetIds,
  tmbId
}: {
  datasetIds: string[];
  tmbId: string;
}) => {
  const permissions = await Promise.all(
    datasetIds.map(async (datasetId) => {
      try {
        await authDatasetByTmbId({
          tmbId,
          datasetId,
          per: ReadPermissionVal
        });
        return true;
      } catch (error) {
        console.log(`Dataset ${datasetId} access denied:`, error);
        return false;
      }
    })
  );

  // Then filter datasetIds based on permissions
  return datasetIds.filter((_, index) => permissions[index]);
};

export const parseDatasetBackup2Chunks = (rawText: string, imageIdList?: string[]) => {
  const csvArr = Papa.parse(rawText).data as string[][];

  if (csvArr.length < 2) {
    return { chunks: [] };
  }
  var header = csvArr[0];
  header = header.map((h) => h.trim());
  // 查找indexes列的起始位置
  let indexesStartIndex = -1;
  for (let i = 0; i < header.length; i++) {
    if (header[i] == 'indexes') {
      indexesStartIndex = i;
      break;
    }
  }
  if (indexesStartIndex == 2) {
    const chunks = csvArr
      .slice(1)
      .map((item) => ({
        q: item[0] || '',
        a: item[1] || '',
        indexes: item.slice(2).filter((item) => item.trim()),
        imageIdList
      }))
      .filter((item) => item.q || item.a);
    return { chunks };
  } else {
    // 从q,a到indexes之间的列为元数据列
    const chunks = csvArr
      .slice(1)
      .map((item) => {
        const q = item[0] || '';
        const a = item[1] || '';

        const indexes = [];
        const metadata = new Map<string, string>();
        for (let i = 2; i < item.length; i++) {
          const value = item[i]?.trim();
          if (!value) continue;
          if (i >= indexesStartIndex) {
            // indexes及之后的列作为indexes
            indexes.push(value);
          } else {
            // 非q、a、indexes列作为metadata
            if (!header[i]) continue;
            metadata.set(header[i], value);
          }
        }
        return {
          q,
          a,
          indexes: indexes.length > 0 ? indexes : undefined,
          imageIdList,
          metadata: metadata.size > 0 ? metadata : undefined
        };
      })
      .filter((item) => item.q || item.a);
    return { chunks };
  }
};

/**
 * 替换数据集引用 markdown 文本中的图片链接格式的 S3 对象键为 JWT 签名后的 URL
 *
 * @param documentQuoteText 数据集引用文本
 * @param expiredTime 过期时间
 * @returns 替换后的文本
 *
 * @example
 *
 * ```typescript
 * const datasetQuoteText = '![image.png](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/aZos7D-214afce5-4d42-4356-9e05-8164d51c59ae.png)';
 * const replacedText = await replaceS3KeyToPreviewUrl(datasetQuoteText, addDays(new Date(), 90))
 * console.log(replacedText)
 * // '![image.png](http://localhost:3000/api/system/file/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvYmplY3RLZXkiOiJjaGF0LzY5MWFlMjlkNDA0ZDA0Njg3MTdkZDc0Ny82OGFkODVhNzQ2MzAwNmM5NjM3OTlhMDcvalhmWHk4eWZHQUZzOVdKcGNXUmJBaFYyL3BhcnNlZC85YTBmNGZlZC00ZWRmLTQ2MTMtYThkNi01MzNhZjVhZTUxZGMucG5nIiwiaWF0IjoxNzYzMzcwOTYwLCJleHAiOjk1MzkzNzA5NjB9.tMDWg0-ZWRnWPNp9Hakd0w1hhaO8jj2oD98SU0wAQYQ)'
 * ```
 */
export function replaceS3KeyToPreviewUrl(documentQuoteText: string, expiredTime: Date) {
  if (!documentQuoteText || typeof documentQuoteText !== 'string')
    return documentQuoteText as string;

  const prefixes = Object.values(S3Sources);
  const pattern = prefixes.map((p) => `${p}\\/[^)]+`).join('|');
  const regex = new RegExp(String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(${pattern})\s*\)`, 'g');

  const matches = Array.from(documentQuoteText.matchAll(regex));
  let content = documentQuoteText;

  for (const match of matches.slice().reverse()) {
    const [full, bang, alt, objectKey] = match;

    if (isS3ObjectKey(objectKey, 'dataset') || isS3ObjectKey(objectKey, 'chat')) {
      const url = jwtSignS3ObjectKey(objectKey, expiredTime);
      const replacement = `${bang}[${alt}](${url})`;
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  return content;
}
