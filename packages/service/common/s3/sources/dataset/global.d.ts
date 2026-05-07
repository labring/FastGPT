import type { S3DatasetSource } from './index';

declare global {
  var datasetBucket: S3DatasetSource;
}

export {};
