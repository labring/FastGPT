import type { S3RawTextSource } from './index';

declare global {
  var rawTextBucket: S3RawTextSource;
}

export {};
