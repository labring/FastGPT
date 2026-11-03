import { createOpaqueS3FileKey } from '../../opaqueKey';

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

/** 校验删除意图指向完整集合目录，不允许扩大为知识库或任意用户前缀。 */
export const isChunkImagePrefix = (prefix: string) =>
  /^dataset\/[a-f0-9]{24}\/chunk-images\/[a-f0-9]{24}\/$/.test(prefix);

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
