import { isS3ObjectKey } from '../utils';
import { S3Buckets } from '../config/constants';
import { S3_DOWNLOAD_URL_BATCH_MAX_SIZE } from '@fastgpt-sdk/storage/access-link';
import { createS3DownloadAccessUrls } from '../accessLink';
import { getS3TextReferences, s3TextKeyRegex } from './textReferences';

const previewUrlS3Sources = ['dataset', 'chat', 'temp'] as const;
const isPreviewUrlS3ObjectKey = (objectKey: string) =>
  previewUrlS3Sources.some((source) => isS3ObjectKey(objectKey, source));

/**
 * 从多段文本（Markdown 图片、普通链接与 HTML `<img>` 标签）中提取允许签发预览链接的 S3 对象键，
 * 并去重。
 */
export const getS3ObjectKeysFromTexts = (texts: Array<string | undefined>) => {
  const objectKeys = new Set<string>();

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;

    for (const { objectKey } of getS3TextReferences(text)) {
      if (isPreviewUrlS3ObjectKey(objectKey)) {
        objectKeys.add(objectKey);
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

export type ReplaceS3KeysOptions = {
  /**
   * 仅放行符合条件的 S3 对象键，未通过过滤的键不会被签发为短链，保持原文本不替换。
   * 知识库 data 调用方应传入 dataset key 过滤器；本通用工具本身仍兼容 chat/temp 场景。
   */
  filter?: (objectKey: string) => boolean;
};

/**
 * 批量替换多段文本中的 S3 对象键，所有唯一 key 共用批量签发请求。
 * 默认支持通用预览场景；知识库 data 必须通过 `options.filter` 收敛为当前 dataset 的
 * `dataset/*` key。没有可预览 key 时返回输入副本，避免再次扫描文本和创建短链映射。
 */
export const replaceS3KeysToPreviewUrls = async (
  documentQuoteTexts: string[],
  expiredTime: Date,
  options?: ReplaceS3KeysOptions
) => {
  const allObjectKeys = getS3ObjectKeysFromTexts(documentQuoteTexts);
  const objectKeys = options?.filter ? allObjectKeys.filter(options.filter) : allObjectKeys;
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
export async function replaceS3KeyToPreviewUrl(
  documentQuoteText: string,
  expiredTime: Date,
  options?: ReplaceS3KeysOptions
) {
  const [content] = await replaceS3KeysToPreviewUrls([documentQuoteText], expiredTime, options);
  return content!;
}
