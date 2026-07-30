import type {
  IAwsS3CompatibleStorageOptions,
  ICosStorageOptions,
  IOssStorageOptions,
  IR2StorageOptions,
  IStorageOptions
} from '@fastgpt-sdk/storage';
import { serviceEnv } from '../../../env';
import { StorageDownloadUrlModeSchema } from '../contracts/type';

export const S3Buckets = {
  public: serviceEnv.STORAGE_PUBLIC_BUCKET,
  private: serviceEnv.STORAGE_PRIVATE_BUCKET
} as const;

export const getSystemMaxFileSize = () => global.feConfigs.uploadFileMaxSize || 1024; // MB, 默认 1024MB;

export const S3_KEY_PATH_INVALID_CHARS = /[|\\/]/;

/** 关闭后浏览器对象存储上传回退到既有单 PUT 链路，便于 provider 故障时快速止损。 */
export const S3_MULTIPART_UPLOAD_ENABLED = serviceEnv.STORAGE_MULTIPART_UPLOAD_ENABLED;
/** 大于该大小的浏览器直传文件切换到代理层 Multipart 上传。 */
export const S3_MULTIPART_UPLOAD_THRESHOLD_BYTES = 32 * 1024 * 1024;
/** 首期固定分片大小，超过 S3/OSS/COS 常见最小分片限制。 */
export const S3_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const S3_MULTIPART_CONCURRENCY = 3;
export const S3_MULTIPART_MAX_RETRY = 3;
export { MAX_MULTIPART_PART_COUNT } from '@fastgpt/global/common/file/constants';
export const S3_MULTIPART_SESSION_EXPIRE_HOURS = 3;
/** provider complete 发生网络超时后，保留完成权的短租约，过期后允许同一 uploadId 重试。 */
export const S3_MULTIPART_COMPLETING_LEASE_MS = 5 * 60 * 1000;

type BucketStorageOptions = {
  publicBucket: string;
  privateBucket: string;
  externalEndpoint?: string;
  publicEndpoint?: string;
};

const storageRegion = serviceEnv.STORAGE_REGION;
const storageVendor = serviceEnv.STORAGE_VENDOR;
const storageExternalEndpoint = serviceEnv.STORAGE_EXTERNAL_ENDPOINT;
export const storageS3CdnEndpoint = serviceEnv.STORAGE_S3_CDN_ENDPOINT;
const storageS3Endpoint = serviceEnv.STORAGE_S3_ENDPOINT;
export const storageDownloadUrlMode = StorageDownloadUrlModeSchema.parse(
  serviceEnv.STORAGE_DOWNLOAD_URL_MODE
);
export const storageDownloadRedirectTtlSeconds = serviceEnv.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS;
const needExplicitExternalEndpointForRedirect = storageVendor === 'minio';
export const canUseStorageDownloadRedirect =
  !needExplicitExternalEndpointForRedirect || Boolean(storageExternalEndpoint);
const storagePublicAccessExtraSubPath = serviceEnv.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH;

const bucketStorageOptions = {
  publicBucket: S3Buckets.public,
  privateBucket: S3Buckets.private,
  externalEndpoint: storageExternalEndpoint,
  publicEndpoint: serviceEnv.STORAGE_R2_PUBLIC_ENDPOINT
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

    case 'r2': {
      return {
        vendor: 'r2',
        endpoint: storageS3Endpoint,
        region: storageRegion,
        credentials: {
          accessKeyId: serviceEnv.STORAGE_ACCESS_KEY_ID,
          secretAccessKey: serviceEnv.STORAGE_SECRET_ACCESS_KEY
        },
        forcePathStyle: false,
        ...bucketStorageOptions,
        maxRetries: serviceEnv.STORAGE_S3_MAX_RETRIES,
        publicAccessExtraSubPath: storagePublicAccessExtraSubPath
      } satisfies Omit<IR2StorageOptions, 'bucket'> & BucketStorageOptions;
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
  if (!storageS3CdnEndpoint || storageVendor === 'r2') {
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
