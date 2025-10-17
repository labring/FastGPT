import { S3PublicBucket } from './buckets/public';
import { S3PrivateBucket } from './buckets/private';

export function initS3Buckets() {
  const publicBucket = new S3PublicBucket();
  const privateBucket = new S3PrivateBucket();

  global.s3BucketMap = {
    [publicBucket.name]: publicBucket,
    [privateBucket.name]: privateBucket
  };
}
