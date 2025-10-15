import { S3PrivateBucket } from './buckets/private';
import { S3PublicBucket } from './buckets/public';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { ClientOptions } from 'minio';

export const Mimes = {
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',

  '.csv': 'text/csv',
  '.txt': 'text/plain',

  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.json': 'application/json',
  '.doc': 'application/msword',
  '.js': 'application/javascript',
  '.xls': 'application/vnd.ms-excel',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
} as const;

export const defaultS3Options: {
  externalBaseURL?: string;
  maxFileSize?: number;
  afterInit?: () => Promise<void> | void;
} & ClientOptions = {
  maxFileSize: 1024 ** 3, // 1GB

  useSSL: process.env.S3_USE_SSL === 'true',
  endPoint: process.env.S3_ENDPOINT || 'localhost',
  externalBaseURL: process.env.S3_EXTERNAL_BASE_URL,
  accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
  port: process.env.S3_PORT ? parseInt(process.env.S3_PORT) : 9000,
  transportAgent: process.env.HTTP_PROXY
    ? new HttpProxyAgent(process.env.HTTP_PROXY)
    : process.env.HTTPS_PROXY
      ? new HttpsProxyAgent(process.env.HTTPS_PROXY)
      : undefined
};

export const S3Buckets = {
  public: process.env.S3_PUBLIC_BUCKET || 'fastgpt-public',
  private: process.env.S3_PRIVATE_BUCKET || 'fastgpt-private'
} as const;
