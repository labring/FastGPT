import { S3PublicBucket } from './buckets/public';
import { S3PrivateBucket } from './buckets/private';
import { addLog } from '../system/log';
import { startS3DelWorker } from './mq';

export function initS3Buckets() {
  const publicBucket = new S3PublicBucket({ init: true });
  const privateBucket = new S3PrivateBucket({ init: true });

  global.s3BucketMap = {
    [publicBucket.bucketName]: publicBucket,
    [privateBucket.bucketName]: privateBucket
  };
}

export const initS3MQWorker = async () => {
  addLog.info('Init S3 Delete Worker...');
  await startS3DelWorker();
};
