import type {
  IAwsS3CompatibleStorageOptions,
  ICosStorageOptions,
  IOssStorageOptions,
  IStorageOptions
} from '@fastgpt-sdk/storage';
import { env } from '../../../env';

export const S3Buckets = {
  public: env.STORAGE_PUBLIC_BUCKET,
  private: env.STORAGE_PRIVATE_BUCKET
} as const;

export const getSystemMaxFileSize = () => global.feConfigs.uploadFileMaxSize || 1024; // MB, 默认 1024MB;

export const S3_KEY_PATH_INVALID_CHARS = /[|\\/]/;

type BucketStorageOptions = {
  publicBucket: string;
  privateBucket: string;
  externalEndpoint?: string;
};

const storageRegion = env.STORAGE_REGION;
const storageExternalEndpoint = env.STORAGE_EXTERNAL_ENDPOINT;
const storageS3Endpoint = env.STORAGE_S3_ENDPOINT;
export const storageDownloadMode = env.STORAGE_EXTERNAL_ENDPOINT ? 'presigned' : 'proxy';
const storagePublicAccessExtraSubPath = env.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH;

const bucketStorageOptions = {
  publicBucket: S3Buckets.public,
  privateBucket: S3Buckets.private,
  externalEndpoint: storageExternalEndpoint
} satisfies BucketStorageOptions;

const awsCompatibleSharedOptions = {
  forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
  maxRetries: env.STORAGE_S3_MAX_RETRIES,
  publicAccessExtraSubPath: storagePublicAccessExtraSubPath
};

export function createDefaultStorageOptions() {
  const vendor = env.STORAGE_VENDOR as IStorageOptions['vendor'];

  switch (vendor) {
    case 'minio': {
      return {
        vendor: 'minio',
        endpoint: storageS3Endpoint,
        region: storageRegion,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
        },
        ...bucketStorageOptions,
        ...awsCompatibleSharedOptions
      } satisfies Omit<IAwsS3CompatibleStorageOptions, 'bucket'> & BucketStorageOptions;
    }

    case 'aws-s3': {
      return {
        vendor: 'aws-s3',
        endpoint: storageS3Endpoint,
        region: storageRegion,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
        },
        ...bucketStorageOptions,
        ...awsCompatibleSharedOptions
      } satisfies Omit<IAwsS3CompatibleStorageOptions, 'bucket'> & BucketStorageOptions;
    }

    case 'cos': {
      return {
        vendor: 'cos',
        region: storageRegion,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
        },
        protocol: env.STORAGE_COS_PROTOCOL,
        useAccelerate: env.STORAGE_COS_USE_ACCELERATE,
        domain: env.STORAGE_COS_CNAME_DOMAIN,
        proxy: env.STORAGE_COS_PROXY,
        ...bucketStorageOptions
      } satisfies Omit<ICosStorageOptions, 'bucket'> & BucketStorageOptions;
    }

    case 'oss': {
      return {
        vendor: 'oss',
        endpoint: env.STORAGE_OSS_ENDPOINT,
        region: storageRegion,
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
        },
        cname: env.STORAGE_OSS_CNAME,
        internal: env.STORAGE_OSS_INTERNAL,
        secure: env.STORAGE_OSS_SECURE,
        enableProxy: env.STORAGE_OSS_ENABLE_PROXY,
        ...bucketStorageOptions
      } satisfies Omit<IOssStorageOptions, 'bucket'> & BucketStorageOptions;
    }

    default: {
      throw new Error(`Unsupported storage vendor: ${vendor}`);
    }
  }
}
