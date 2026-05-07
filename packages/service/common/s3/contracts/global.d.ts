import type { S3BaseBucket } from '../buckets/base';

declare global {
  var s3BucketMap: {
    [key: string]: S3BaseBucket;
  };
}

export {};
