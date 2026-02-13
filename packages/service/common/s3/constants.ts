import type {
  IAwsS3CompatibleStorageOptions,
  ICosStorageOptions,
  IOssStorageOptions,
  IStorageOptions
} from '@fastgpt-sdk/storage';

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

export const S3Buckets = {
  public: process.env.STORAGE_PUBLIC_BUCKET || 'fastgpt-public',
  private: process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private'
} as const;

export const getSystemMaxFileSize = () => {
  const config = global.feConfigs.uploadFileMaxSize || 1024; // MB, default 1024MB
  return config; // bytes
};

export const S3_KEY_PATH_INVALID_CHARS = /[|\\/]/;

export function createDefaultStorageOptions() {
  const vendor = (process.env.STORAGE_VENDOR || 'minio') as IStorageOptions['vendor'];

  switch (vendor) {
    case 'minio': {
      return {
        vendor: 'minio',
        forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true' ? true : false,
        externalBaseUrl: process.env.STORAGE_EXTERNAL_ENDPOINT || undefined,
        endpoint: process.env.STORAGE_S3_ENDPOINT || 'http://localhost:9000',
        region: process.env.STORAGE_REGION || 'us-east-1',
        publicBucket: process.env.STORAGE_PUBLIC_BUCKET || 'fastgpt-public',
        privateBucket: process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || 'minioadmin',
          secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || 'minioadmin'
        },
        maxRetries: process.env.STORAGE_S3_MAX_RETRIES
          ? parseInt(process.env.STORAGE_S3_MAX_RETRIES)
          : 3,
        publicAccessExtraSubPath: process.env.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH || undefined
      } satisfies Omit<IAwsS3CompatibleStorageOptions, 'bucket'> & {
        publicBucket: string;
        privateBucket: string;
        externalBaseUrl?: string;
      };
    }

    case 'aws-s3': {
      return {
        vendor: 'aws-s3',
        forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === 'true' ? true : false,
        externalBaseUrl: process.env.STORAGE_EXTERNAL_ENDPOINT || undefined,
        endpoint: process.env.STORAGE_S3_ENDPOINT || '',
        region: process.env.STORAGE_REGION || 'us-east-1',
        publicBucket: process.env.STORAGE_PUBLIC_BUCKET || 'fastgpt-public',
        privateBucket: process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || ''
        },
        maxRetries: process.env.STORAGE_S3_MAX_RETRIES
          ? parseInt(process.env.STORAGE_S3_MAX_RETRIES)
          : 3,
        publicAccessExtraSubPath: process.env.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH || undefined
      } satisfies Omit<IAwsS3CompatibleStorageOptions, 'bucket'> & {
        publicBucket: string;
        privateBucket: string;
        externalBaseUrl?: string;
      };
    }

    case 'cos': {
      return {
        vendor: 'cos',
        externalBaseUrl: process.env.STORAGE_EXTERNAL_ENDPOINT || undefined,
        region: process.env.STORAGE_REGION || 'ap-shanghai',
        publicBucket: process.env.STORAGE_PUBLIC_BUCKET || 'fastgpt-public',
        privateBucket: process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || ''
        },
        protocol: (process.env.STORAGE_COS_PROTOCOL as 'https:' | 'http:' | undefined) || 'https:',
        useAccelerate: process.env.STORAGE_COS_USE_ACCELERATE === 'true' ? true : false,
        domain: process.env.STORAGE_COS_CNAME_DOMAIN || undefined,
        proxy: process.env.STORAGE_COS_PROXY || undefined
      } satisfies Omit<ICosStorageOptions, 'bucket'> & {
        publicBucket: string;
        privateBucket: string;
        externalBaseUrl?: string;
      };
    }

    case 'oss': {
      return {
        vendor: 'oss',
        externalBaseUrl: process.env.STORAGE_EXTERNAL_ENDPOINT || undefined,
        endpoint: process.env.STORAGE_OSS_ENDPOINT || '',
        region: process.env.STORAGE_REGION || 'oss-cn-hangzhou',
        publicBucket: process.env.STORAGE_PUBLIC_BUCKET || 'fastgpt-public',
        privateBucket: process.env.STORAGE_PRIVATE_BUCKET || 'fastgpt-private',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || ''
        },
        cname: process.env.STORAGE_OSS_CNAME === 'true' ? true : false,
        internal: process.env.STORAGE_OSS_INTERNAL === 'true' ? true : false,
        secure: process.env.STORAGE_OSS_SECURE === 'true' ? true : false,
        enableProxy: process.env.STORAGE_OSS_ENABLE_PROXY === 'false' ? false : true
      } satisfies Omit<IOssStorageOptions, 'bucket'> & {
        publicBucket: string;
        privateBucket: string;
        externalBaseUrl?: string;
      };
    }

    default: {
      throw new Error(`Unsupported storage vendor: ${vendor}`);
    }
  }
}
