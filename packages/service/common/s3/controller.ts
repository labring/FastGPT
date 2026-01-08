import { MongoS3TTL } from './schema';
import { addLog } from '../system/log';
import { setCron } from '../system/cron';
import { checkTimerLock } from '../system/timerLock/utils';
import { TimerIdEnum } from '../system/timerLock/constants';
import path from 'node:path';
import { S3Error } from 'minio';

export async function clearExpiredMinioFiles() {
  try {
    const expiredFiles = await MongoS3TTL.find({
      expiredTime: { $lte: new Date() }
    }).lean();
    if (expiredFiles.length === 0) {
      addLog.info('No expired minio files to clean');
      return;
    }

    addLog.info(`Found ${expiredFiles.length} expired minio files to clean`);

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
          addLog.info(
            `Deleted expired minio file: ${file.minioKey} from bucket: ${file.bucketName}`
          );
        } else {
          addLog.warn(`Bucket not found: ${file.bucketName}`);
        }
      } catch (error) {
        fail++;
        addLog.error(`Failed to delete minio file: ${file.minioKey}`, error);
      }
    }

    addLog.info(`Minio TTL cleanup completed. Success: ${success}, Failed: ${fail}`);
  } catch (error) {
    addLog.error('Error in clearExpiredMinioFiles', error);
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
