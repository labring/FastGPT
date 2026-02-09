import { MongoS3TTL } from './schema';
import { getLogger, LogCategories } from '../logger';
import { setCron } from '../system/cron';
import { checkTimerLock } from '../system/timerLock/utils';
import { TimerIdEnum } from '../system/timerLock/constants';

const logger = getLogger(LogCategories.INFRA.S3);

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

        if (bucket) {
          await bucket.addDeleteJob({ key: file.minioKey });
          await MongoS3TTL.deleteOne({ _id: file._id });

          success++;
          logger.info('Deleted expired S3 object', {
            key: file.minioKey,
            bucketName: file.bucketName
          });
        } else {
          logger.warn('S3 bucket not found for expired file', {
            bucketName: file.bucketName,
            key: file.minioKey
          });
          await MongoS3TTL.deleteOne({ minioKey: file.minioKey, bucketName: file.bucketName });
          logger.info('Cleanup the expired document in MongoDB of S3 TTL', {
            key: file.minioKey,
            bucketName: file.bucketName
          });
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

export async function clearExpiredS3FilesCron() {
  // 启动服务时执行一次
  await clearExpiredMinioFiles();

  // 每小时执行一次
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
