import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { S3Sources } from '../../common/s3/contracts/type';
import { jwtSignS3DownloadToken, isS3ObjectKey } from '../../common/s3/utils';
import { getLogger, LogCategories } from '../../common/logger';
import { S3Buckets } from '../../common/s3/config/constants';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { getVlmModelList } from '../ai/model';
import { MongoDataset } from './schema';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';

const logger = getLogger(LogCategories.MODULE.DATASET.FILE);

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
 * // '![image.png](http://localhost:3000/api/system/file/download/xxx?filename=image.png)'
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

    const allowedKeys: (keyof typeof S3Sources)[] = ['dataset', 'chat', 'temp'];
    const allowedKeysGuard = allowedKeys.some((key) => isS3ObjectKey(objectKey, key));

    if (allowedKeysGuard) {
      const url = jwtSignS3DownloadToken({
        objectKey,
        bucketName: S3Buckets.private,
        expiredTime
      });
      const replacement = `${bang}[${alt}](${url})`;
      content =
        content.slice(0, match.index) + replacement + content.slice(match.index + full.length);
    }
  }

  return content;
}

export const ensureDatasetVlmModel = async (
  dataset: DatasetSchemaType
): Promise<DatasetSchemaType> => {
  const vlmModelList = getVlmModelList();
  const configuredVlmModel = dataset.vlmModel
    ? vlmModelList.find((item) => item.model === dataset.vlmModel || item.name === dataset.vlmModel)
    : undefined;

  if (configuredVlmModel) return dataset;

  const defaultVlmModel = vlmModelList[0];

  if (!defaultVlmModel?.model) {
    if (dataset.vlmModel) {
      await MongoDataset.findByIdAndUpdate(dataset._id, {
        $unset: { vlmModel: '' }
      });

      return {
        ...dataset,
        vlmModel: undefined
      };
    }

    return dataset;
  }

  await MongoDataset.findByIdAndUpdate(dataset._id, {
    vlmModel: defaultVlmModel.model
  });

  return {
    ...dataset,
    vlmModel: defaultVlmModel.model
  };
};

export const getAvailableDatasetVlmModel = (vlmModel?: string) => {
  const vlmModelList = getVlmModelList();

  if (!vlmModel) return vlmModelList[0];

  return vlmModelList.find((item) => item.model === vlmModel || item.name === vlmModel);
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

export type DatasetDataIndexRebuildItem = {
  type?: DatasetDataIndexTypeEnum;
  text: string;
  dataId?: string;
};
export type DatasetDataIndexRebuildPlanItem = Omit<DatasetDataIndexRebuildItem, 'type'> & {
  type: DatasetDataIndexTypeEnum;
};

export const matchDatasetDataMarkdownImages = (text = '') => {
  const regex = /!\[([\s\S]*?)\]\((.*?)\)/g;
  return Array.from(text.matchAll(regex))
    .map((match) => ({
      alt: match[1]?.trim() || '',
      url: match[2]?.trim() || ''
    }))
    .filter((item) => item.url);
};

export const matchDatasetDataMarkdownImageUrls = (text = '') =>
  matchDatasetDataMarkdownImages(text).map((item) => item.url);

const buildVlmImageIndexText = ({
  text,
  imageDescMap
}: {
  text: string;
  imageDescMap?: Record<string, string>;
}) => {
  let hasDescription = false;
  const result = text.replace(/!\[([\s\S]*?)\]\((.*?)\)/g, (match, alt: string, url: string) => {
    const imageUrl = url?.trim();
    const description = imageDescMap?.[imageUrl] || alt?.trim();
    if (!description) return match;

    hasDescription = true;
    return description.replace(/\n/g, '');
  });

  return hasDescription ? result.trim() : '';
};

const isSameStringSet = (a: string[], b: string[]) => {
  const aSet = new Set(a);
  const bSet = new Set(b);

  if (aSet.size !== bSet.size) return false;

  return Array.from(aSet).every((item) => bSet.has(item));
};

const getIndexKey = (index: DatasetDataIndexRebuildItem) =>
  `${index.type || DatasetDataIndexTypeEnum.custom}\n${index.text}`;

export const buildDatasetDataIndexRebuildPlan = ({
  indexes,
  existingIndexes,
  oldQ = '',
  oldA = '',
  nextQ = '',
  nextA = '',
  supportVlm,
  supportImageEmbedding,
  imageIndex,
  autoIndexes,
  isImageCollection = false,
  imageId,
  imageDescMap
}: {
  indexes: DatasetDataIndexRebuildItem[];
  existingIndexes: DatasetDataIndexRebuildItem[];
  oldQ?: string;
  oldA?: string;
  nextQ?: string;
  nextA?: string;
  supportVlm: boolean;
  supportImageEmbedding: boolean;
  imageIndex?: boolean;
  autoIndexes?: boolean;
  isImageCollection?: boolean;
  imageId?: string;
  imageDescMap?: Record<string, string>;
}) => {
  const existingIndexMap = new Map(existingIndexes.map((index) => [getIndexKey(index), index]));
  const inputIndexes = indexes.map((index) => {
    const type = index.type || DatasetDataIndexTypeEnum.custom;
    const dataId = index.dataId || existingIndexMap.get(getIndexKey({ ...index, type }))?.dataId;

    return {
      ...index,
      type,
      ...(dataId && { dataId })
    };
  });
  const existingImageEmbeddingMap = new Map(
    [...inputIndexes, ...existingIndexes]
      .filter((index) => index.type === DatasetDataIndexTypeEnum.imageEmbedding)
      .map((index) => [index.text, index])
  );
  const oldImageUrls = Array.from(new Set(matchDatasetDataMarkdownImageUrls(oldQ)));
  const nextImageUrls = Array.from(new Set(matchDatasetDataMarkdownImageUrls(nextQ)));
  const contentChanged = oldQ !== nextQ || oldA !== nextA;
  const imageUrlsChanged = !isSameStringSet(oldImageUrls, nextImageUrls);
  const hasMarkdownImages = !!imageIndex && nextImageUrls.length > 0;
  const hasQuestionIndex = inputIndexes.some(
    (index) => index.type === DatasetDataIndexTypeEnum.question
  );
  const hasSummaryIndex = inputIndexes.some(
    (index) => index.type === DatasetDataIndexTypeEnum.summary
  );
  const needRebuildAutoIndex =
    !!autoIndexes && (contentChanged || !hasQuestionIndex || !hasSummaryIndex);

  const baseIndexes = inputIndexes.filter((index) => {
    if (
      index.type === DatasetDataIndexTypeEnum.image ||
      index.type === DatasetDataIndexTypeEnum.imageEmbedding
    ) {
      return false;
    }

    if (
      (index.type === DatasetDataIndexTypeEnum.summary ||
        index.type === DatasetDataIndexTypeEnum.question) &&
      (!autoIndexes || needRebuildAutoIndex)
    ) {
      return false;
    }

    return true;
  });

  const shouldCreateVlmImageIndex = supportVlm && hasMarkdownImages;
  const existingVlmImageIndexMap = new Map(
    [...inputIndexes, ...existingIndexes]
      .filter((index) => index.type === DatasetDataIndexTypeEnum.image)
      .map((index) => [index.dataId || getIndexKey(index), index])
  );
  const existingVlmImageIndexes = Array.from(existingVlmImageIndexMap.values());
  const needRebuildVlmImageIndex =
    shouldCreateVlmImageIndex &&
    (contentChanged || imageUrlsChanged || existingVlmImageIndexes.length === 0);
  const rebuiltVlmImageIndexText =
    shouldCreateVlmImageIndex && needRebuildVlmImageIndex
      ? buildVlmImageIndexText({
          text: nextQ,
          imageDescMap
        })
      : '';
  const vlmImageIndexes =
    shouldCreateVlmImageIndex && !needRebuildVlmImageIndex
      ? existingVlmImageIndexes.map((index) => ({
          ...index,
          type: DatasetDataIndexTypeEnum.image
        }))
      : rebuiltVlmImageIndexText
        ? [
            {
              type: DatasetDataIndexTypeEnum.image,
              text: rebuiltVlmImageIndexText
            }
          ]
        : [];

  const imageEmbeddingSources = Array.from(
    new Set([
      ...(supportImageEmbedding && isImageCollection && imageId ? [imageId] : []),
      ...(supportImageEmbedding && imageIndex ? nextImageUrls : [])
    ])
  );
  const imageEmbeddingIndexes =
    supportImageEmbedding && (imageIndex || isImageCollection)
      ? imageEmbeddingSources.map((source) => {
          const existingIndex = existingImageEmbeddingMap.get(source);

          return {
            type: DatasetDataIndexTypeEnum.imageEmbedding,
            text: source,
            ...(existingIndex?.dataId && { dataId: existingIndex.dataId })
          };
        })
      : [];

  const finalIndexes: DatasetDataIndexRebuildPlanItem[] = [
    ...baseIndexes,
    ...vlmImageIndexes,
    ...imageEmbeddingIndexes
  ].map((index) => ({
    ...index,
    type: index.type || DatasetDataIndexTypeEnum.custom
  }));

  return {
    indexes: finalIndexes,
    contentChanged,
    imageUrlsChanged,
    hasMarkdownImages,
    needRebuildAutoIndex,
    needRebuildVlmImageIndex: needRebuildVlmImageIndex && !rebuiltVlmImageIndexText
  };
};

export const filterDatasetDataIndexesByImageCapability = <
  T extends { type?: DatasetDataIndexTypeEnum; text: string }
>({
  indexes,
  supportVlm,
  supportImageEmbedding,
  imageIndex,
  isImageCollection = false
}: {
  indexes: T[];
  supportVlm: boolean;
  supportImageEmbedding: boolean;
  imageIndex?: boolean;
  isImageCollection?: boolean;
}) => {
  return indexes.filter((index) => {
    if (index.type === DatasetDataIndexTypeEnum.image) {
      return supportVlm && imageIndex;
    }

    if (index.type === DatasetDataIndexTypeEnum.imageEmbedding) {
      return supportImageEmbedding && (imageIndex || isImageCollection);
    }

    return true;
  });
};
