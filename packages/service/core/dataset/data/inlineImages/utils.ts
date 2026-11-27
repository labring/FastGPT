import {
  matchDocumentImages,
  unescapeMarkdownImageUrl
} from '@fastgpt/global/common/string/markdown';
import { getS3TextReferences } from '../../../../common/s3/utils/textReferences';
import { createOpaqueS3FileKey } from '../../../../common/s3/opaqueKey';
import { S3Buckets } from '../../../../common/s3/config/constants';
import type { S3MQJobData } from '@fastgpt/dal/redis/bullmq/services/s3FileDelete';

export type ChunkImageContent = {
  q?: string;
  a?: string;
  imageId?: string;
  indexes?: Array<{ text?: string }>;
};

/** 按预览支持的语法临时提取受管图片，不在 data/task 中持久化第二份引用清单。 */
export const getChunkImageReferences = (data: ChunkImageContent[]) =>
  new Set(
    data
      .flatMap((item) => [
        ...(item.imageId ? [item.imageId] : []),
        ...[
          item.q ?? '',
          item.a ?? '',
          ...(item.indexes?.map(({ text }) => text ?? '') ?? [])
        ].flatMap((text) => [
          ...matchDocumentImages(text).map((image) =>
            image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url
          ),
          ...getS3TextReferences(text).map(({ objectKey, format }) =>
            format === 'markdown' ? unescapeMarkdownImageUrl(objectKey) : objectKey
          ),
          // 预览正则先要求 dataset/ 前缀；普通链接的转义斜线需先还原再识别，HTML 保持字面值。
          ...getS3TextReferences(unescapeMarkdownImageUrl(text))
            .filter(({ format }) => format === 'markdown')
            .map(({ objectKey }) => objectKey)
        ])
      ])
      .filter((key) => parseChunkImageKey(key))
  );

const scopePattern = /^dataset\/([a-f0-9]{24})\/chunk-images\/([a-f0-9]{24})\//;

/** 提取新正文图片的稳定集合范围；不把旧文件解析图或其他 dataset 对象纳入目录回收。 */
export const parseChunkImageKey = (key: string) => {
  const match = scopePattern.exec(key);
  if (!match || !/^file\/[a-f0-9]{32}(?:\.[a-z0-9._+-]+)?$/.test(key.slice(match[0].length)))
    return undefined;
  return { datasetId: match[1], chunkImagePrefixId: match[2] };
};

/** 从已鉴权集合构造精确目录，尾部斜线防止相近标识之间前缀误匹配。 */
export const getChunkImagePrefix = ({
  datasetId,
  chunkImagePrefixId
}: {
  datasetId: string;
  chunkImagePrefixId: string;
}) => {
  if (!/^[a-f0-9]{24}$/.test(datasetId) || !/^[a-f0-9]{24}$/.test(chunkImagePrefixId))
    throw new Error('Invalid chunk image scope');
  return `dataset/${datasetId}/chunk-images/${chunkImagePrefixId}/`;
};

/** 生成集合正文图片 key；所有 scope 必须来自服务端已鉴权的集合。 */
export const createChunkImageKey = ({
  datasetId,
  chunkImagePrefixId,
  filename
}: {
  datasetId: string;
  chunkImagePrefixId: string;
  filename: string;
}) => {
  const prefix = getChunkImagePrefix({ datasetId, chunkImagePrefixId });
  return createOpaqueS3FileKey({ prefix: prefix.slice(0, -1).split('/'), filename }).objectKey;
};

/** 业务层根据真实集合范围生成目录任务；由最外层事务提交后交给现有 S3 队列。 */
export const getChunkImageCleanupJobs = (
  scopes: { datasetId: string; chunkImagePrefixId?: string }[]
): S3MQJobData[] =>
  [
    ...new Set(
      scopes.flatMap(({ datasetId, chunkImagePrefixId }) =>
        chunkImagePrefixId
          ? [getChunkImagePrefix({ datasetId: String(datasetId), chunkImagePrefixId })]
          : []
      )
    )
  ].map((prefix) => ({ bucketName: S3Buckets.private, prefix }));
