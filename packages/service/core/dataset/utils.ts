import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
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
