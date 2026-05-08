import type {
  IAwsS3CompatibleStorageOptions,
  ICosStorageOptions,
  IOssStorageOptions,
  IStorageOptions
} from '@fastgpt-sdk/storage';
import { serviceEnv } from '../../../env';

export const S3Buckets = {
  public: serviceEnv.STORAGE_PUBLIC_BUCKET,
  private: serviceEnv.STORAGE_PRIVATE_BUCKET
} as const;

export const getSystemMaxFileSize = () => global.feConfigs.uploadFileMaxSize || 1024; // MB, 默认 1024MB;

export const S3_KEY_PATH_INVALID_CHARS = /[|\\/]/;

type BucketStorageOptions = {
  publicBucket: string;
  privateBucket: string;
  externalEndpoint?: string;
};

const storageRegion = serviceEnv.STORAGE_REGION;
const storageExternalEndpoint = serviceEnv.STORAGE_EXTERNAL_ENDPOINT;
export const storageS3CdnEndpoint = serviceEnv.STORAGE_S3_CDN_ENDPOINT;
const storageS3Endpoint = serviceEnv.STORAGE_S3_ENDPOINT;
export const storageDownloadMode = serviceEnv.STORAGE_EXTERNAL_ENDPOINT ? 'presigned' : 'proxy';
const storagePublicAccessExtraSubPath = serviceEnv.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH;

const bucketStorageOptions = {
  publicBucket: S3Buckets.public,
  privateBucket: S3Buckets.private,
  externalEndpoint: storageExternalEndpoint
} satisfies BucketStorageOptions;

const awsCompatibleSharedOptions = {
  forcePathStyle: serviceEnv.STORAGE_S3_FORCE_PATH_STYLE,
  maxRetries: serviceEnv.STORAGE_S3_MAX_RETRIES,
  publicAccessExtraSubPath: storagePublicAccessExtraSubPath
};

export function createDefaultStorageOptions() {
  const vendor = serviceEnv.STORAGE_VENDOR as IStorageOptions['vendor'];

  switch (vendor) {
    case 'minio': {
      return {
        vendor: 'minio',
        endpoint: storageS3Endpoint,
        region: storageRegion,
        credentials: {
          accessKeyId: serviceEnv.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: serviceEnv.STORAGE_SECRET_ACCESS_KEY
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
          accessKeyId: serviceEnv.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: serviceEnv.STORAGE_SECRET_ACCESS_KEY
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
          accessKeyId: serviceEnv.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: serviceEnv.STORAGE_SECRET_ACCESS_KEY
        },
        protocol: serviceEnv.STORAGE_COS_PROTOCOL,
        useAccelerate: serviceEnv.STORAGE_COS_USE_ACCELERATE,
        domain: serviceEnv.STORAGE_COS_CNAME_DOMAIN,
        proxy: serviceEnv.STORAGE_COS_PROXY,
        ...bucketStorageOptions
      } satisfies Omit<ICosStorageOptions, 'bucket'> & BucketStorageOptions;
    }

    case 'oss': {
      return {
        vendor: 'oss',
        endpoint: serviceEnv.STORAGE_OSS_ENDPOINT,
        region: storageRegion,
        credentials: {
          accessKeyId: serviceEnv.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: serviceEnv.STORAGE_SECRET_ACCESS_KEY
        },
        cname: serviceEnv.STORAGE_OSS_CNAME,
        internal: serviceEnv.STORAGE_OSS_INTERNAL,
        secure: serviceEnv.STORAGE_OSS_SECURE,
        enableProxy: serviceEnv.STORAGE_OSS_ENABLE_PROXY,
        ...bucketStorageOptions
      } satisfies Omit<IOssStorageOptions, 'bucket'> & BucketStorageOptions;
    }

    default: {
      throw new Error(`Unsupported storage vendor: ${vendor}`);
    }
  }
}

export function replaceS3UrlWithCdnEndpoint(url: string) {
  if (!storageS3CdnEndpoint) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    const cdnUrl = new URL(storageS3CdnEndpoint);
    const cdnPath = cdnUrl.pathname.replace(/\/$/, '');
    const sourcePath = parsedUrl.pathname.replace(/^\//, '');

    parsedUrl.protocol = cdnUrl.protocol;
    parsedUrl.host = cdnUrl.host;
    parsedUrl.username = '';
    parsedUrl.password = '';

    if (cdnPath && cdnPath !== '/') {
      parsedUrl.pathname = `${cdnPath}/${sourcePath}`;
    }

    return parsedUrl.toString();
  } catch {
    return url;
  }
}
