import { UserError } from '@fastgpt/global/common/error/utils';
import type { ClientSession } from '../../../../common/mongo';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoS3TTL } from '../../../../common/s3/models/ttl';
import { S3Buckets } from '../../../../common/s3/config/constants';
import { removeS3TTL } from '../../../../common/s3/utils';
import { parseChunkImageKey, getChunkImageReferences, type ChunkImageContent } from './utils';

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
  session
}: {
  teamId: string;
  datasetId: string;
  collectionId: string;
  data: ChunkImageContent[];
  imageUploadKeys?: string[];
  session: ClientSession;
}) => {
  const keys = [...getChunkImageReferences(data)];
  if (keys.length === 0) return;
  const scopes = keys.map((key) => parseChunkImageKey(key)!);
  const prefixId = scopes[0].chunkImagePrefixId;
  if (
    scopes.some((scope) => scope.datasetId !== datasetId || scope.chunkImagePrefixId !== prefixId)
  )
    throw new UserError('Image does not belong to this collection');

  const collection = await MongoDatasetCollection.findOne({
    _id: collectionId,
    teamId,
    datasetId,
    chunkImagePrefixId: prefixId
  })
    .session(session)
    .select('_id')
    .lean();
  if (!collection) throw new UserError('Image does not belong to this collection');

  const newKeys = keys.filter((key) => imageUploadKeys.includes(key));
  const pending = await MongoS3TTL.find({
    bucketName: S3Buckets.private,
    minioKey: { $in: keys }
  })
    .session(session)
    .lean();
  if (pending.some((file) => !newKeys.includes(file.minioKey)))
    throw new UserError('Image upload has not been committed');
  if (newKeys.length === 0) return;
  const promoted = await removeS3TTL({ key: newKeys, bucketName: 'private', session });
  if (promoted?.deletedCount !== newKeys.length)
    throw new UserError('Image upload is no longer available');
};
