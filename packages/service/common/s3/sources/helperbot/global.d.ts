import type { S3HelperBotSource } from './index';

declare global {
  var helperBotBucket: S3HelperBotSource;
}

export {};
