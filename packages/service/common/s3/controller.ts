import { MongoS3TTL } from './schema';
import { addLog } from '../system/log';
import { setCron } from '../system/cron';
import { checkTimerLock } from '../system/timerLock/utils';
import { TimerIdEnum } from '../system/timerLock/constants';
import { S3PrivateBucket } from './buckets/private';
import { S3PublicBucket } from './buckets/public';

function getBucket(bucketName: string) {
  if (bucketName === process.env.S3_PUBLIC_BUCKET) return new S3PublicBucket();
  if (bucketName === process.env.S3_PRIVATE_BUCKET) return new S3PrivateBucket();
  throw new Error(`Unknown bucket name: ${bucketName}`);
}

export async function clearExpiredMinioFiles() {
  try {
    const now = new Date();

    const expiredFiles = await MongoS3TTL.find({ expiredTime: { $lte: now } }).lean();
    if (expiredFiles.length === 0) {
      addLog.info('No expired minio files to clean');
      return;
    }

    addLog.info(`Found ${expiredFiles.length} expired minio files to clean`);

    let success = 0;
    let fail = 0;

    for (const file of expiredFiles) {
      try {
        const bucket = getBucket(file.bucketName);
        await bucket.delete(file.minioKey);
        await MongoS3TTL.deleteOne({ _id: file._id });

        success++;
        addLog.info(`Deleted expired minio file: ${file.minioKey} from bucket: ${file.bucketName}`);
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

export function clearExpiredMinioFilesCron() {
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
