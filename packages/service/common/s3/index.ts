import { S3PublicBucket } from './buckets/public';
import { S3PrivateBucket } from './buckets/private';
import { getLogger, LogCategories } from '../logger';
import { startS3DelWorker } from './mq';

const logger = getLogger(LogCategories.INFRA.S3);

export function initS3Buckets() {
  const publicBucket = new S3PublicBucket();
  const privateBucket = new S3PrivateBucket();

  global.s3BucketMap = {
    [publicBucket.bucketName]: publicBucket,
    [privateBucket.bucketName]: privateBucket
  };
}

export const initS3MQWorker = async () => {
  logger.info('Starting S3 delete worker');
  await startS3DelWorker();
};
