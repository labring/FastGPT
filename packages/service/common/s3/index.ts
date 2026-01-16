import { S3PublicBucket } from './buckets/public';
import { S3PrivateBucket } from './buckets/private';
import { getLogger, infra } from '../logger';
import { startS3DelWorker } from './mq';

const logger = getLogger(infra.storage);

export function initS3Buckets() {
  const publicBucket = new S3PublicBucket();
  const privateBucket = new S3PrivateBucket();

  global.s3BucketMap = {
    [publicBucket.bucketName]: publicBucket,
    [privateBucket.bucketName]: privateBucket
  };
}

export const initS3MQWorker = async () => {
  logger.info('Init S3 Delete Worker...');
  await startS3DelWorker();
};
