import { S3Sources } from '../contracts/type';
import { isS3ObjectKey } from '../utils';
import { S3Buckets } from '../config/constants';
import { S3_DOWNLOAD_URL_BATCH_MAX_SIZE } from '@fastgpt-sdk/storage/access-link';
import { createS3DownloadAccessUrls } from '../accessLink';

const previewUrlS3Sources = ['dataset', 'chat', 'temp'] as const;
const isPreviewUrlS3ObjectKey = (objectKey: string) =>
  previewUrlS3Sources.some((source) => isS3ObjectKey(objectKey, source));

const htmlUnquotedValuePattern = /[^\s"'=<>`]+/.source;
const s3SourcePattern = Object.values(S3Sources)
  .map((prefix) => `${prefix}\\/`)
  .join('|');

/**
 * 匹配文本中的 Markdown 图片语法或带有 src 属性的完整 HTML `<img>` 标签。
 * HTML 分支先按属性 token 消费 src 前的内容，再捕获 src 前缀、值和后缀，避免命中引号属性值中的 `src=` 文本。
 * 正则在模块加载时编译一次；`matchAll` 会使用独立迭代器，`replace` 也不会把调用状态泄漏给下一次调用。
 */
const s3TextKeyRegex = new RegExp(
  String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(?:<((?:${s3SourcePattern})[^)]+)>|((?:${s3SourcePattern})[^\s)]+))(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)|(<img\b(?:(?:[^"'<>]|"[^"]*"|'[^']*'))*?\s+src\s*=\s*)(?:"([^"]*)"|'([^']*)'|(${htmlUnquotedValuePattern}))((?:(?:[^"'<>]|"[^"]*"|'[^']*'))*>)`,
  'gi'
);

/**
 * 从多段文本（Markdown 图片语法与 HTML `<img>` 标签）中提取允许签发预览链接的 S3 对象键，
 * 并去重。
 */
export const getS3ObjectKeysFromTexts = (texts: Array<string | undefined>) => {
  const objectKeys = new Set<string>();

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;

    for (const match of text.matchAll(s3TextKeyRegex)) {
      const markdownObjectKey = match[3] ?? match[4];
      const htmlObjectKey = match[7] ?? match[8] ?? match[9];
      const matchedObjectKey = markdownObjectKey ?? htmlObjectKey?.trim();
      if (matchedObjectKey && isPreviewUrlS3ObjectKey(matchedObjectKey)) {
        objectKeys.add(matchedObjectKey);
      }
    }
  }

  return Array.from(objectKeys);
};

/**
 * 为一批 S3 对象键创建预览 URL 映射。
 *
 * 输入会先去重，并按 SDK 的批量上限分片，避免调用方因结果规模变化退化成逐条 Mongo 查询。
 */
export const createS3KeysPreviewUrlMap = async ({
  objectKeys,
  expiredTime
}: {
  objectKeys: string[];
  expiredTime: Date;
}) => {
  const uniqueObjectKeys = Array.from(new Set(objectKeys));
  const previewUrlMap = new Map<string, string>();

  for (let index = 0; index < uniqueObjectKeys.length; index += S3_DOWNLOAD_URL_BATCH_MAX_SIZE) {
    const batchKeys = uniqueObjectKeys.slice(index, index + S3_DOWNLOAD_URL_BATCH_MAX_SIZE);
    const urls = await createS3DownloadAccessUrls(
      batchKeys.map((objectKey) => ({
        objectKey,
        bucketName: S3Buckets.private,
        expiredTime
      }))
    );

    batchKeys.forEach((objectKey, batchIndex) => {
      previewUrlMap.set(objectKey, urls[batchIndex]!);
    });
  }

  return previewUrlMap;
};

/** 使用已签发的 URL 映射替换 Markdown 图片语法与 HTML <img> 标签中的 S3 对象键，不产生额外存储 IO。 */
export const replaceS3KeysWithPreviewUrlMap = (
  documentQuoteText: string,
  previewUrlMap: ReadonlyMap<string, string>
) => {
  if (!documentQuoteText || typeof documentQuoteText !== 'string' || previewUrlMap.size === 0) {
    return documentQuoteText as string;
  }

  return documentQuoteText.replace(
    s3TextKeyRegex,
    (
      full,
      bang,
      alt,
      wrappedObjectKey,
      unwrappedObjectKey,
      markdownTitle,
      htmlPrefix,
      doubleQuoted,
      singleQuoted,
      unquoted,
      htmlSuffix
    ) => {
      if (htmlPrefix !== undefined) {
        const objectKey = (doubleQuoted ?? singleQuoted ?? unquoted)?.trim();
        const previewUrl = objectKey ? previewUrlMap.get(objectKey) : undefined;
        if (!previewUrl) return full;

        if (doubleQuoted !== undefined) return `${htmlPrefix}"${previewUrl}"${htmlSuffix}`;
        if (singleQuoted !== undefined) return `${htmlPrefix}'${previewUrl}'${htmlSuffix}`;
        return `${htmlPrefix}"${previewUrl}"${htmlSuffix}`;
      }

      const objectKey = wrappedObjectKey ?? unwrappedObjectKey;
      const previewUrl = objectKey ? previewUrlMap.get(objectKey) : undefined;
      return previewUrl ? `${bang}[${alt}](${previewUrl}${markdownTitle ?? ''})` : full;
    }
  );
};

/**
 * 批量替换多段文本中的 S3 对象键，所有唯一 key 共用批量签发请求。
 * 没有可预览 key 时返回输入副本，避免再次扫描文本和创建短链映射。
 */
export const replaceS3KeysToPreviewUrls = async (
  documentQuoteTexts: string[],
  expiredTime: Date
) => {
  const objectKeys = getS3ObjectKeysFromTexts(documentQuoteTexts);
  if (objectKeys.length === 0) return documentQuoteTexts.slice();

  const previewUrlMap = await createS3KeysPreviewUrlMap({
    objectKeys,
    expiredTime
  });

  return documentQuoteTexts.map((text) => replaceS3KeysWithPreviewUrlMap(text, previewUrlMap));
};

/**
 * 替换数据集引用文本中的 S3 对象键为短访问 URL。
 *
 * @param documentQuoteText 数据集引用文本
 * @param expiredTime 过期时间
 * @returns 替换后的文本
 */
export async function replaceS3KeyToPreviewUrl(documentQuoteText: string, expiredTime: Date) {
  const [content] = await replaceS3KeysToPreviewUrls([documentQuoteText], expiredTime);
  return content!;
}
