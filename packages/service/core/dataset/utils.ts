import { authDatasetByTmbId } from '../../support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { S3Sources } from '../../common/s3/contracts/type';
import { jwtSignS3DownloadToken, isS3ObjectKey } from '../../common/s3/utils';
import { getLogger, LogCategories } from '../../common/logger';
import { S3Buckets } from '../../common/s3/config/constants';
import { getVlmModelList, isImageEmbeddingModel } from '../ai/model';
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

export type DatasetDataIndexRebuildItem = {
  type?: DatasetDataIndexTypeEnum;
  text: string;
  dataId?: string;
};
export type DatasetDataIndexRebuildPlanItem = Omit<DatasetDataIndexRebuildItem, 'type'> & {
  type: DatasetDataIndexTypeEnum;
};

/**
 * 从 dataset data 的 markdown 内容中提取图片地址。
 *
 * 这里只负责识别 `![alt](url)` 里的 url，用于判断文档内是否存在图片、
 * 图片地址是否变化，以及后续是否需要补充图片相关索引。
 * 图片来源合法性校验、S3/base64 转换、向量生成都在后续链路处理。
 */
export const matchDatasetDataMarkdownImageUrls = (text = '') => {
  const regex = /!\[([\s\S]*?)\]\((.*?)\)/g;
  return Array.from(text.matchAll(regex))
    .map((match) => match[2]?.trim() || '')
    .filter(Boolean);
};

const getIndexKey = (index: DatasetDataIndexRebuildItem) =>
  `${index.type || DatasetDataIndexTypeEnum.custom}\n${index.text}`;

/**
 * 生成单条 dataset data 更新时的索引重建计划。
 *
 * 这个函数只做纯计算，不写 Mongo、不写向量库、不调用 VLM：
 * - 保留非默认、非多模态索引，避免“更新索引”覆盖用户手动维护的索引。
 * - 为图片集合主图和文档内 markdown 图片补充 `imageEmbedding` 索引草稿。
 *
 * 默认索引由后续 `updateDatasetDataByIndexes` 根据 Q/A 重新生成；
 * question、summary、custom、image 等其他索引只能通过单条索引接口手动更新。
 */
export const buildDatasetDataIndexRebuildPlan = ({
  indexes,
  existingIndexes,
  nextQ = '',
  supportImageEmbedding,
  imageIndex,
  isImageCollection = false,
  imageId
}: {
  indexes: DatasetDataIndexRebuildItem[];
  existingIndexes: DatasetDataIndexRebuildItem[];
  nextQ?: string;
  supportImageEmbedding: boolean;
  imageIndex?: boolean;
  isImageCollection?: boolean;
  imageId?: string;
}) => {
  // 同类型同文本的索引可以复用旧向量 id，减少不必要的向量重建。
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

  // 图片向量索引按图片来源去重，来源不变时沿用已有 dataId。
  const existingImageEmbeddingMap = new Map(
    [...inputIndexes, ...existingIndexes]
      .filter((index) => index.type === DatasetDataIndexTypeEnum.imageEmbedding)
      .map((index) => [index.text, index])
  );
  const nextImageUrls = Array.from(new Set(matchDatasetDataMarkdownImageUrls(nextQ)));

  // 默认索引和多模态索引由本次更新重新生成，其他索引原样保留。
  const baseIndexes = inputIndexes.filter((index) => {
    return (
      index.type !== DatasetDataIndexTypeEnum.default &&
      index.type !== DatasetDataIndexTypeEnum.imageEmbedding
    );
  });

  // 多模态图片向量索引直接基于图片来源生成，后续向量写入阶段会做合法性校验和格式转换。
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
    ...imageEmbeddingIndexes
  ].map((index) => ({
    ...index,
    type: index.type || DatasetDataIndexTypeEnum.custom
  }));

  return {
    indexes: finalIndexes
  };
};
