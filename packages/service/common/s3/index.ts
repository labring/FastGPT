import { S3PublicBucket } from './buckets/public';
import { S3PrivateBucket } from './buckets/private';
import { addLog } from '../system/log';
import { s3MQ } from './mq';

export function initS3Buckets() {
  const publicBucket = new S3PublicBucket();
  const privateBucket = new S3PrivateBucket();

  global.s3BucketMap = {
    [publicBucket.name]: publicBucket,
    [privateBucket.name]: privateBucket
  };
}

export const initS3MQWorker = () => {
  addLog.info('Init S3 MQ Worker...');
  return s3MQ.startWorker();
};
