import { getDatasetCleanupPrefix, isDatasetCleanupPrefix, isDatasetFileCleanupKey } from './utils';
import type { ClientSession } from '../../mongo';
import { MongoS3TTL } from '../models/ttl';
import { S3Buckets } from '../config/constants';
import {
  getChunkImagePrefix,
  isChunkImagePrefix,
  parseChunkImageKey
} from '../sources/dataset/chunkImageKey';
import type { S3TtlSchemaType } from '@fastgpt/global/common/file/s3TTL/type';

/** 与集合删除同事务保存精确目录意图；回滚不删图，提交后即使进程退出仍可由 cron 恢复。 */
export const createChunkImagePrefixCleanup = async ({
  scopes,
  session
}: {
  scopes: { datasetId: string; chunkImagePrefixId?: string }[];
  session: ClientSession;
}) => {
  const prefixes = [
    ...new Set(
      scopes.flatMap((scope) =>
        scope.chunkImagePrefixId
          ? [
              getChunkImagePrefix({
                datasetId: String(scope.datasetId),
                chunkImagePrefixId: scope.chunkImagePrefixId
              })
            ]
          : []
      )
    )
  ];
  if (prefixes.length === 0) return [];
  const records = await MongoS3TTL.insertMany(
    prefixes.map((prefix) => ({
      bucketName: S3Buckets.private,
      minioKey: prefix,
      expiredTime: new Date(),
      cleanupType: 'collectionImagePrefix' as const
    })),
    { session }
  );
  return records.map((record) => String(record._id));
};

/** 实际删除知识库时同事务登记总目录，覆盖旧源文件、解析图和新图片；库已删除仍可补投。 */
export const createDatasetPrefixCleanup = async ({
  datasetIds,
  session
}: {
  datasetIds: string[];
  session: ClientSession;
}) => {
  const prefixes = [...new Set(datasetIds.map(String))].map(getDatasetCleanupPrefix);
  if (prefixes.length === 0) return [];
  const records = await MongoS3TTL.insertMany(
    prefixes.map((prefix) => ({
      bucketName: S3Buckets.private,
      minioKey: prefix,
      expiredTime: new Date(),
      cleanupType: 'datasetPrefix' as const
    })),
    { session }
  );
  return records.map((record) => String(record._id));
};

/** 清空但保留知识库时，仅登记旧集合持有的源文件；不回收未来新集合写入的同库资源。 */
export const createDatasetFileCleanup = async ({
  collections,
  session
}: {
  collections: { datasetId: string; fileId?: string }[];
  session: ClientSession;
}) => {
  const keys = [
    ...new Set(
      collections.flatMap(({ datasetId, fileId }) =>
        fileId &&
        fileId.startsWith(getDatasetCleanupPrefix(String(datasetId))) &&
        isDatasetFileCleanupKey(fileId)
          ? [fileId]
          : []
      )
    )
  ];
  if (keys.length === 0) return [];
  const records = await MongoS3TTL.insertMany(
    keys.map((key) => ({
      bucketName: S3Buckets.private,
      minioKey: key,
      expiredTime: new Date(),
      cleanupType: 'datasetFile' as const
    })),
    { session }
  );
  return records.map((record) => String(record._id));
};

/** 临时上传到期领取与事务内提升竞争同一记录；旧扫描快照不能误删已被接收的图片。 */
export const claimChunkImageUploadCleanup = async (file: S3TtlSchemaType) => {
  if (!parseChunkImageKey(file.minioKey) || file.multipart)
    throw new Error('Invalid chunk image upload cleanup');
  const claimed = await MongoS3TTL.findOneAndUpdate(
    {
      _id: file._id,
      cleanupType: 'collectionImageUpload',
      expiredTime: { $lte: new Date() }
    },
    { $set: { cleanupClaimed: true } },
    { new: true }
  ).lean();
  return Boolean(claimed);
};

/** 集合正文图片只接受已领取的临时清理；永久图片必须通过目录删除，普通对象不受影响。 */
export const filterChunkImageDeleteKeys = async ({
  bucketName,
  keys
}: {
  bucketName: string;
  keys: string[];
}) => {
  const managed = keys.filter((key) => parseChunkImageKey(key));
  if (managed.length === 0) return keys;
  const claimed = await MongoS3TTL.find({
    bucketName,
    minioKey: { $in: managed },
    cleanupType: 'collectionImageUpload',
    cleanupClaimed: true
  })
    .select('minioKey')
    .lean();
  const deletable = new Set(claimed.map((file) => file.minioKey));
  return keys.filter((key) => !parseChunkImageKey(key) || deletable.has(key));
};

/** 新目录必须存在已提交的删除意图；其他来源和整个知识库前缀仍按原规则执行。 */
export const canDeleteChunkImagePrefix = async ({
  bucketName,
  prefix
}: {
  bucketName: string;
  prefix: string;
}) => {
  if (!/^dataset\/[a-f0-9]{24}\/chunk-images\//.test(prefix)) return true;
  if (!isChunkImagePrefix(prefix)) throw new Error('Invalid chunk image cleanup prefix');
  return Boolean(
    await MongoS3TTL.exists({ bucketName, minioKey: prefix, cleanupType: 'collectionImagePrefix' })
  );
};

/** 仅在物理删除成功后调用，保留失败记录供定时重派；重复执行为空操作。 */
export const completeS3LifecycleCleanup = async ({
  bucketName,
  keys,
  prefix
}: {
  bucketName: string;
  keys?: string[];
  prefix?: string;
}) => {
  if (keys?.some((key) => parseChunkImageKey(key)))
    await MongoS3TTL.deleteMany({
      bucketName,
      minioKey: { $in: keys },
      cleanupType: 'collectionImageUpload',
      cleanupClaimed: true
    });
  if (keys?.some(isDatasetFileCleanupKey))
    await MongoS3TTL.deleteMany({
      bucketName,
      minioKey: { $in: keys },
      cleanupType: 'datasetFile'
    });
  if (prefix && isChunkImagePrefix(prefix))
    await MongoS3TTL.deleteMany({
      bucketName,
      minioKey: prefix,
      cleanupType: 'collectionImagePrefix'
    });
  // 只完成总目录意图，未接收上传仍保留 TTL，避免删除目录后迟到的上传失去回收依据。
  if (prefix && isDatasetCleanupPrefix(prefix))
    await MongoS3TTL.deleteMany({ bucketName, minioKey: prefix, cleanupType: 'datasetPrefix' });
};
