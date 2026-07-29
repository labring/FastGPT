import { MongoS3TTL } from '../models/ttl';
import { getLogger, LogCategories } from '../../logger';
import { setCron } from '../../system/cron';
import { checkTimerLock } from '../../system/timerLock/utils';
import { TimerIdEnum } from '../../system/timerLock/constants';

const logger = getLogger(LogCategories.INFRA.S3);

/**
 * 扫描过期的 S3 TTL 记录；Multipart 记录先 Abort 远端分片，普通对象才提交删除任务。
 * bucket 暂不可用时保留 Multipart 记录，等待后续 cron 重试，避免丢失 uploadId。
 */
export async function clearExpiredMinioFiles() {
  try {
    const expiredFiles = await MongoS3TTL.find({
      expiredTime: { $lte: new Date() }
    }).lean();
    if (expiredFiles.length === 0) {
      logger.info('No expired S3 files to clean');
      return;
    }

    logger.info('Found expired S3 files to clean', { count: expiredFiles.length });

    let success = 0;
    let fail = 0;

    for (const file of expiredFiles) {
      try {
        const bucketName = file.bucketName;
        const bucket = global.s3BucketMap[bucketName];
        const multipartUploadId = file.multipart?.uploadId?.trim();
        const hasMultipartMarker = file.multipart !== undefined && file.multipart !== null;

        if (bucket) {
          if (hasMultipartMarker) {
            if (!multipartUploadId) {
              throw new Error('Invalid Multipart TTL record: uploadId is missing');
            }
            // Multipart TTL 只代表未完成的远端分片，不应提交最终对象删除任务。
            await bucket.abortMultipartUploadByUploadId({
              key: file.minioKey,
              uploadId: multipartUploadId
            });
          } else {
            await bucket.addDeleteJob({ key: file.minioKey });
          }
          await MongoS3TTL.deleteOne({ _id: file._id });

          success++;
          logger.info('Cleaned expired S3 file', {
            key: file.minioKey,
            bucketName: file.bucketName,
            multipart: hasMultipartMarker
          });
        } else {
          logger.warn('S3 bucket not found for expired file', {
            bucketName: file.bucketName,
            key: file.minioKey
          });
          if (!hasMultipartMarker) {
            await MongoS3TTL.deleteOne({ minioKey: file.minioKey, bucketName: file.bucketName });
            logger.info('Removed expired S3 TTL without bucket', {
              key: file.minioKey,
              bucketName: file.bucketName
            });
          } else {
            logger.info('Deferred expired Multipart cleanup because bucket is unavailable', {
              key: file.minioKey,
              bucketName: file.bucketName
            });
          }
        }
      } catch (error) {
        fail++;
        logger.error('Failed to delete expired S3 object', {
          key: file.minioKey,
          bucketName: file.bucketName,
          error
        });
      }
    }

    logger.info('S3 TTL cleanup completed', { success, fail });
  } catch (error) {
    logger.error('S3 TTL cleanup failed', {
      error
    });
  }
}

export function clearExpiredS3FilesCron() {
  setTimeout(clearExpiredMinioFiles, 3000);

  setCron('0 */1 * * *', async () => {
    if (
      await checkTimerLock({
        timerId: TimerIdEnum.clearExpiredMinioFiles,
        lockMinuted: 59
      })
    ) {
      await clearExpiredMinioFiles();
    }
  });
}
