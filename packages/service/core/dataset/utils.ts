import { MongoDatasetData } from './data/schema';
import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { S3Sources } from '../../common/s3/type';
import { getS3DatasetSource } from '../../common/s3/sources/dataset';
import { getS3ChatSource } from '../../common/s3/sources/chat';
import { EndpointUrl } from '@fastgpt/global/common/file/constants';
import { jwtSignS3ObjectKey } from '../../common/s3/utils';

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

/**
 * 替换数据集引用 markdown 文本中的图片链接格式的 S3 对象键为 JWT 签名后的 URL
 *
 * @param datasetQuoteText 数据集引用文本
 * @returns 替换后的文本
 *
 * @example
 *
 * ```typescript
 * const datasetQuoteText = '![image.png](dataset/68fee42e1d416bb5ddc85b19/6901c3071ba2bea567e8d8db/aZos7D-214afce5-4d42-4356-9e05-8164d51c59ae.png)';
 * const replacedText = await replaceDatasetQuoteTextWithJWT(datasetQuoteText)
 * console.log(replacedText)
 * // '![image.png](http://localhost:3000/api/system/file/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvYmplY3RLZXkiOiJjaGF0LzY5MWFlMjlkNDA0ZDA0Njg3MTdkZDc0Ny82OGFkODVhNzQ2MzAwNmM5NjM3OTlhMDcvalhmWHk4eWZHQUZzOVdKcGNXUmJBaFYyL3BhcnNlZC85YTBmNGZlZC00ZWRmLTQ2MTMtYThkNi01MzNhZjVhZTUxZGMucG5nIiwiaWF0IjoxNzYzMzcwOTYwLCJleHAiOjk1MzkzNzA5NjB9.tMDWg0-ZWRnWPNp9Hakd0w1hhaO8jj2oD98SU0wAQYQ)'
 * ```
 */
export async function replaceDatasetQuoteTextWithJWT(datasetQuoteText: string) {
  if (!datasetQuoteText || typeof datasetQuoteText !== 'string') return datasetQuoteText as string;

  const prefixPattern = Object.values(S3Sources)
    .map((pattern) => `${pattern}\\/[^\\s)]+`)
    .join('|');
  const regex = new RegExp(String.raw`(!?)\[([^\]]+)\]\((?!https?:\/\/)(${prefixPattern})\)`, 'g');
  const s3DatasetSource = getS3DatasetSource();
  const s3ChatSource = getS3ChatSource();

  const matches = Array.from(datasetQuoteText.matchAll(regex));
  let content = datasetQuoteText;

  for (const match of matches.slice().reverse()) {
    const [full, bang, alt, objectKey] = match;

    if (s3DatasetSource.isDatasetObjectKey(objectKey) || s3ChatSource.isChatFileKey(objectKey)) {
      const token = jwtSignS3ObjectKey(objectKey);
      const url = `${EndpointUrl}/api/system/file/${token}`;
      const replacement = `${bang}[${alt}](${url})`;
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  return content;
}
