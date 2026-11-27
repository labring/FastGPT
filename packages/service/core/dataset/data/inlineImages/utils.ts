import { unescapeMarkdownImageUrl } from '@fastgpt/global/common/string/markdown';
import { createOpaqueS3FileKey } from '../../../../common/s3/opaqueKey';
import { S3Buckets } from '../../../../common/s3/config/constants';
import {
  forEachDocumentImageAndGap,
  forEachFallbackMarkdownLink
} from '../../../../common/s3/utils/textReferences';
import type { S3MQJobData } from '@fastgpt/dal/redis/bullmq/services/s3FileDelete';

export type ChunkImageContent = {
  q?: string;
  a?: string;
  imageId?: string;
  indexes?: Array<{ text?: string }>;
};

/** 快速预判：CommonMark 仅转义 ASCII 标点，chunk-images 目录名中只有连字符前可能出现反斜杠。 */
const possibleChunkImageHintRegex = /chunk\\?-images/i;
/** 粘连校验 `](` 后的受管图片目标地址（支持 CommonMark 标点转义如 dataset\/ 与 chunk\-images），避免 O(N^2) 回溯与整段反转义。 */
const markdownChunkDestinationRegex =
  /\s*(?:<(dataset\\?\/[^>\r\n]+)>|(dataset\\?\/[^\s)\r\n]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/iy;

const collectChunkImageKeysFromText = (text: string, keys: Set<string>) => {
  if (!text || !possibleChunkImageHintRegex.test(text)) return;

  forEachDocumentImageAndGap(text, {
    onImage: (image) => {
      const url = image.format === 'markdown' ? unescapeMarkdownImageUrl(image.url) : image.url;
      if (parseChunkImageKey(url)) keys.add(url);
    },
    onGap: (gapText, gapOffset) => {
      if (!gapText.includes('](') || !possibleChunkImageHintRegex.test(gapText)) return;

      forEachFallbackMarkdownLink(
        gapText,
        gapOffset,
        markdownChunkDestinationRegex,
        ({ destMatch }) => {
          const rawDest = destMatch[1] ?? destMatch[2];
          if (!rawDest) return;
          const url = unescapeMarkdownImageUrl(rawDest);
          if (parseChunkImageKey(url)) keys.add(url);
        }
      );
    }
  });
};

/** 按预览支持的语法临时提取受管图片，仅对命中的目标地址反转义，不在 data/task 中持久化第二份引用清单。 */
export const getChunkImageReferences = (data: ChunkImageContent[]) => {
  const keys = new Set<string>();
  for (const item of data) {
    if (item.imageId && parseChunkImageKey(item.imageId)) keys.add(item.imageId);
    if (item.q) collectChunkImageKeysFromText(item.q, keys);
    if (item.a) collectChunkImageKeysFromText(item.a, keys);
    if (item.indexes) {
      for (const index of item.indexes) {
        if (index.text) collectChunkImageKeysFromText(index.text, keys);
      }
    }
  }
  return keys;
};

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
