import { MongoMinioTtl } from './schema';
import { S3BucketManager } from '../../s3/buckets/manager';
import { addLog } from '../../system/log';
import { setCron } from '../../system/cron';
import { checkTimerLock } from '../../system/timerLock/utils';
import { TimerIdEnum } from '../../system/timerLock/constants';

export async function clearExpiredMinioFiles() {
  try {
    const now = new Date();

    const expiredFiles = await MongoMinioTtl.find({
      expiredTime: { $exists: true, $ne: null, $lte: now }
    }).lean();

    if (expiredFiles.length === 0) {
      addLog.info('No expired minio files to clean');
      return;
    }

    addLog.info(`Found ${expiredFiles.length} expired minio files to clean`);

    const s3Manager = S3BucketManager.getInstance();
    let success = 0;
    let fail = 0;

    for (const file of expiredFiles) {
      try {
        const bucket = (() => {
          switch (file.bucketName) {
            case process.env.S3_PUBLIC_BUCKET:
              return s3Manager.getPublicBucket();
            case process.env.S3_PRIVATE_BUCKET:
              return s3Manager.getPrivateBucket();
            default:
              throw new Error(`Unknown bucket name: ${file.bucketName}`);
          }
        })();

        await bucket.delete(file.minioKey);

        await MongoMinioTtl.deleteOne({ _id: file._id });

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

export async function addMinioTtlFile({
  bucketName,
  minioKey,
  expiredTime
}: {
  bucketName: string;
  minioKey: string;
  expiredTime?: Date;
}) {
  try {
    await MongoMinioTtl.create({
      bucketName,
      minioKey,
      expiredTime
    });
    addLog.info(`Added minio TTL file: ${minioKey}, expiredTime: ${expiredTime}`);
  } catch (error) {
    addLog.error('Failed to add minio TTL file', error);
    throw error;
  }
}
