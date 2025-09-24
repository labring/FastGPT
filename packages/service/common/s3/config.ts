import type { S3ServiceConfig } from './type';

export const defualtS3Config: Omit<S3ServiceConfig, 'bucket'> = {
  endPoint: process.env.S3_ENDPOINT || 'localhost',
  port: process.env.S3_PORT ? parseInt(process.env.S3_PORT) : 9000,
  useSSL: process.env.S3_USE_SSL === 'true',
  accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
  externalBaseURL: process.env.S3_EXTERNAL_BASE_URL
};
