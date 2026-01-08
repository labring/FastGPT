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
  afterInit?: () => Promise<void> | void;
  init?: boolean;
} & ClientOptions = {
  useSSL: process.env.S3_USE_SSL === 'true',
  endPoint: process.env.S3_ENDPOINT || 'localhost',
  externalBaseURL: process.env.S3_EXTERNAL_BASE_URL,
  accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
  port: process.env.S3_PORT ? parseInt(process.env.S3_PORT) : 9000,
  pathStyle: process.env.S3_PATH_STYLE === 'false' ? false : true,
  region: process.env.S3_REGION || undefined
};

export const S3Buckets = {
  public: process.env.S3_PUBLIC_BUCKET || 'fastgpt-public',
  private: process.env.S3_PRIVATE_BUCKET || 'fastgpt-private'
} as const;

export const getSystemMaxFileSize = () => {
  const config = global.feConfigs?.uploadFileMaxSize || 1024; // MB, default 1024MB
  return config; // bytes
};

export const S3_KEY_PATH_INVALID_CHARS = /[|\\/]/;
