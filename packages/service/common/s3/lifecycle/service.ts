import { isDatasetCleanupPrefix, isDatasetFileCleanupKey } from './utils';
import type { S3TtlSchemaType } from '@fastgpt/global/common/file/s3TTL/type';
import { MongoS3TTL } from '../models/ttl';
import { isChunkImagePrefix } from '../sources/dataset/chunkImageKey';
import { claimChunkImageUploadCleanup } from './entity';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.S3);

/** 新清理记录先领取/校验再入队，队列接受不移除记录，物理删除失败可由 cron 重派。 */
export const enqueueS3LifecycleCleanup = async (file: S3TtlSchemaType) => {
  const bucket = global.s3BucketMap?.[file.bucketName];
  if (!bucket) return false;
  if (file.cleanupType === 'collectionImageUpload') {
    if (!(await claimChunkImageUploadCleanup(file))) return false;
    await bucket.addDeleteJob({ key: file.minioKey });
  } else if (file.cleanupType === 'collectionImagePrefix') {
    if (!isChunkImagePrefix(file.minioKey) || file.multipart)
      throw new Error('Invalid chunk image prefix cleanup');
    await bucket.addDeleteJob({ prefix: file.minioKey });
  } else if (file.cleanupType === 'datasetPrefix') {
    if (!isDatasetCleanupPrefix(file.minioKey) || file.multipart)
      throw new Error('Invalid dataset prefix cleanup');
    await bucket.addDeleteJob({ prefix: file.minioKey });
  } else if (file.cleanupType === 'datasetFile') {
    if (!isDatasetFileCleanupKey(file.minioKey) || file.multipart)
      throw new Error('Invalid dataset file cleanup');
    await bucket.addDeleteJob({ key: file.minioKey });
  } else return false;
  return true;
};

/** 最外层事务提交后派发目录或旧文件任务，失败保留 Mongo 意图，避免清理错误覆盖已成功的业务删除。 */
export const dispatchS3LifecycleCleanup = async (ids: string[] = []) => {
  if (ids.length === 0) return;
  const records = await MongoS3TTL.find({
    _id: { $in: ids },
    cleanupType: { $in: ['collectionImagePrefix', 'datasetPrefix', 'datasetFile'] }
  })
    .lean()
    .catch((error) => {
      logger.warn('Defer S3 resource cleanup lookup to cron', { error, cleanupIds: ids });
      return [];
    });
  for (const file of records)
    await enqueueS3LifecycleCleanup(file).catch((error) => {
      logger.warn('Defer S3 resource cleanup to cron', { error, cleanupId: file._id });
    });
};
