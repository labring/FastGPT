import type { S3ChatSource } from './index';

declare global {
  var chatBucket: S3ChatSource;
}

export {};
