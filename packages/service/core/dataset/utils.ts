import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { S3Sources } from '../../common/s3/contracts/type';
import { isS3ObjectKey } from '../../common/s3/utils';
import { getLogger, LogCategories } from '../../common/logger';
import { S3Buckets } from '../../common/s3/config/constants';
import { getVlmModelList, isImageEmbeddingModel } from '../ai/model';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { S3_DOWNLOAD_URL_BATCH_MAX_SIZE } from '@fastgpt-sdk/storage/access-link';
import { createS3DownloadAccessUrls } from '../../common/s3/accessLink';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);
const previewUrlS3Sources = ['dataset', 'chat', 'temp'] as const;

const createS3MarkdownKeyRegex = () => {
  const pattern = Object.values(S3Sources)
    .map((prefix) => `${prefix}\\/[^)]+?`)
    .join('|');

  return new RegExp(String.raw`(!?)\[([^\]]*)\]\(\s*(?!https?:\/\/)(${pattern})\s*\)`, 'g');
};

const isPreviewUrlS3ObjectKey = (objectKey: string) =>
  previewUrlS3Sources.some((source) => isS3ObjectKey(objectKey, source));

/**
 * 从多段 Markdown 中提取允许签发预览链接的 S3 对象键，并按首次出现顺序去重。
 */
export const getS3ObjectKeysFromMarkdownTexts = (texts: Array<string | undefined>) => {
  const objectKeys = new Set<string>();

  for (const text of texts) {
    if (!text || typeof text !== 'string') continue;

    for (const match of text.matchAll(createS3MarkdownKeyRegex())) {
      const objectKey = match[3];
      if (objectKey && isPreviewUrlS3ObjectKey(objectKey)) {
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

/** 使用已签发的 URL 映射替换 Markdown 中的 S3 对象键，不产生额外存储 IO。 */
export const replaceS3KeysWithPreviewUrlMap = (
  documentQuoteText: string,
  previewUrlMap: ReadonlyMap<string, string>
) => {
  if (!documentQuoteText || typeof documentQuoteText !== 'string') {
    return documentQuoteText as string;
  }

  const matches = Array.from(documentQuoteText.matchAll(createS3MarkdownKeyRegex()));
  let content = documentQuoteText;

  for (const match of matches.slice().reverse()) {
    const [full, bang, alt, objectKey] = match;
    const previewUrl = objectKey ? previewUrlMap.get(objectKey) : undefined;

    if (previewUrl) {
      const replacement = `${bang}[${alt}](${previewUrl})`;
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  return content;
};

/** 批量替换多段 Markdown 中的 S3 对象键，所有唯一 key 共用批量签发请求。 */
export const replaceS3KeysToPreviewUrls = async (
  documentQuoteTexts: string[],
  expiredTime: Date
) => {
  const previewUrlMap = await createS3KeysPreviewUrlMap({
    objectKeys: getS3ObjectKeysFromMarkdownTexts(documentQuoteTexts),
    expiredTime
  });

  return documentQuoteTexts.map((text) => replaceS3KeysWithPreviewUrlMap(text, previewUrlMap));
};

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
        logger.warn('Dataset access denied for member', { datasetId, error });
        return false;
      }
    })
  );

  // Then filter datasetIds based on permissions
  return datasetIds.filter((_, index) => permissions[index]);
};

/**
 * 替换数据集引用 markdown 文本中的图片链接格式的 S3 对象键为短访问 URL。
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
 * // '![image.png](http://localhost:3000/api/system/file/d/alias.exp.sig)'
 * ```
 */
export async function replaceS3KeyToPreviewUrl(documentQuoteText: string, expiredTime: Date) {
  const [content] = await replaceS3KeysToPreviewUrls([documentQuoteText], expiredTime);
  return content!;
}

const getAvailableDatasetVlmModel = (vlmModel?: string) => {
  if (!vlmModel) return;

  const vlmModelList = getVlmModelList();

  return vlmModelList.find((item) => item.model === vlmModel || item.name === vlmModel);
};

export const getDatasetImageIndexCapability = ({
  vectorModel,
  vlmModel
}: {
  vectorModel?: string;
  vlmModel?: string;
}) => {
  const availableVlmModel = getAvailableDatasetVlmModel(vlmModel);
  const supportVlm = !!availableVlmModel;
  const supportImageEmbedding = isImageEmbeddingModel(vectorModel);

  return {
    availableVlmModel,
    supportVlm,
    supportImageEmbedding,
    supportImageIndex: supportVlm || supportImageEmbedding
  };
};

export const getDatasetImageTrainingMode = ({
  supportVlm,
  supportImageIndex,
  imageId,
  hasMarkdownImages
}: {
  supportVlm: boolean;
  supportImageIndex: boolean;
  imageId?: string;
  hasMarkdownImages: boolean;
}) => {
  if (supportVlm && imageId) return TrainingModeEnum.imageParse;
  if (supportImageIndex && hasMarkdownImages) return TrainingModeEnum.image;
  return TrainingModeEnum.chunk;
};
