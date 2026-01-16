import { MongoS3TTL } from './schema';
import { getLogger, infra } from '../logger';
import { setCron } from '../system/cron';
import { checkTimerLock } from '../system/timerLock/utils';
import { TimerIdEnum } from '../system/timerLock/constants';
import path from 'node:path';
import { S3Error } from 'minio';

const logger = getLogger(infra.storage);

export async function clearExpiredMinioFiles() {
  try {
    const expiredFiles = await MongoS3TTL.find({
      expiredTime: { $lte: new Date() }
    }).lean();
    if (expiredFiles.length === 0) {
      logger.info('No expired minio files to clean');
      return;
    }

    logger.info(`Found ${expiredFiles.length} expired minio files to clean`);

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
          logger.info(
            `Deleted expired minio file: ${file.minioKey} from bucket: ${file.bucketName}`
          );
        } else {
          logger.warn(`Bucket not found: ${file.bucketName}`);
        }
      } catch (error) {
        fail++;
        logger.error(`Failed to delete minio file: ${file.minioKey}`, { error });
      }
    }

    logger.info(`Minio TTL cleanup completed. Success: ${success}, Failed: ${fail}`);
  } catch (error) {
    logger.error('Error in clearExpiredMinioFiles', { error });
  }
}

export function clearExpiredS3FilesCron() {
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
