import { UserError } from '@fastgpt/global/common/error/utils';
import type { DbSession } from '@fastgpt/dal/db/types';
import { hasCollectionChunkImagePrefix } from '../../collection/entity';
import { findPendingS3TTLKeys, removeS3TTL } from '../../../../common/s3/utils';
import {
  countChunkImagesInContent,
  getChunkImageReferences,
  MAX_INLINE_IMAGES_PER_DATA_ITEM,
  parseChunkImageKey,
  type ChunkImageContent
} from './utils';

/**
 * 写入最终正文时验证新图片属于本集合；本请求实际使用的上传与业务写入同事务取消 TTL。
 * 普通旧 key 不增加查询；临时 key 仅存在于本请求上下文，不写入分块列表。
 */
export const persistChunkImageReferences = async ({
  teamId,
  datasetId,
  collectionId,
  data,
  imageUploadKeys = [],
  tx
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  data: ChunkImageContent[];
  imageUploadKeys?: string[];
  tx?: DbSession;
}) => {
  if (imageUploadKeys.length > 0) {
    // 并发部分编辑可能在预检后改变另一字段，必须在事务内按最终合并正文再校验一次 3 张上限。
    for (const item of data) {
      if (countChunkImagesInContent(item) > MAX_INLINE_IMAGES_PER_DATA_ITEM) {
        throw new UserError(
          `Each data item supports at most ${MAX_INLINE_IMAGES_PER_DATA_ITEM} inline images`
        );
      }
    }
  }

  const keys = [...getChunkImageReferences(data)];
  if (keys.length === 0) return;
  const scopes = keys.map((key) => parseChunkImageKey(key)!);
  const prefixId = scopes[0].chunkImagePrefixId;
  if (
    scopes.some((scope) => scope.datasetId !== datasetId || scope.chunkImagePrefixId !== prefixId)
  )
    throw new UserError('Image does not belong to this collection');

  const ownsPrefix = await hasCollectionChunkImagePrefix({
    teamId,
    datasetId,
    collectionId,
    chunkImagePrefixId: prefixId,
    tx
  });
  if (!ownsPrefix) throw new UserError('Image does not belong to this collection');

  const newKeys = keys.filter((key) => imageUploadKeys.includes(key));
  const pendingKeys = await findPendingS3TTLKeys({ keys, bucketName: 'private', tx });
  if (pendingKeys.some((minioKey) => !newKeys.includes(minioKey)))
    throw new UserError('Image upload has not been committed');
  if (newKeys.length === 0) return;
  const promoted = await removeS3TTL({ key: newKeys, bucketName: 'private', tx });
  if (promoted?.deletedCount !== newKeys.length)
    throw new UserError('Image upload is no longer available');
};
