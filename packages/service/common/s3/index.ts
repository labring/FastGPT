import { S3PublicBucket } from './buckets/public';
import { S3BucketMap } from './constants';
import { S3PrivateBucket } from './buckets/private';

export function initS3Buckets() {
  S3BucketMap.public = new S3PublicBucket();
  S3BucketMap.private = new S3PrivateBucket();
}
