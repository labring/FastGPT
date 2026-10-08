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

/** 达到该大小的浏览器直传文件切换到代理层 Multipart 上传。 */
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
const storageS3Endpoint = serviceEnv.STORAGE_S3_ENDPOINT;
export const storageDownloadRedirectTtlSeconds = serviceEnv.STORAGE_DOWNLOAD_REDIRECT_TTL_SECONDS;
const storagePublicAccessExtraSubPath = serviceEnv.STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH;

/** 由实例配置注入的存储运行策略。 */
type RuntimeStorageConfig = {
  downloadMode?: string;
  externalEndpoint?: string;
  cdnEndpoint?: string;
};

let runtimeStorageConfig: RuntimeStorageConfig | undefined;
let appliedRuntimeStorageKey: string | undefined;

/**
 * 注入实例配置里的存储运行策略，并返回与上次注入相比是否发生变化。
 *
 * 在 initSystemConfig 读取 system_instance_configs 之后调用。下载模式与公开地址以数据库为唯一来源，
 * 不再回落环境变量；返回值用于决定是否需要重建 S3 bucket。
 */
export const applyRuntimeStorageConfig = (config: RuntimeStorageConfig | undefined): boolean => {
  const nextKey = JSON.stringify({
    downloadMode: config?.downloadMode,
    externalEndpoint: config?.externalEndpoint,
    cdnEndpoint: config?.cdnEndpoint
  });
  const changed = appliedRuntimeStorageKey !== undefined && appliedRuntimeStorageKey !== nextKey;
  runtimeStorageConfig = config;
  appliedRuntimeStorageKey = nextKey;
  return changed;
};

/** 对外暴露的下载模式：仅取实例配置，未初始化时使用 Schema 默认值 short-proxy。 */
export const getStorageDownloadUrlMode = () =>
  StorageDownloadUrlModeSchema.parse(runtimeStorageConfig?.downloadMode ?? 'short-proxy');

/** 对外公开的存储地址：仅取实例配置，未配置时返回空字符串（不再回落环境变量）。 */
export const getStorageExternalEndpoint = () => runtimeStorageConfig?.externalEndpoint ?? '';

/** short-redirect 临时地址使用的 CDN 地址：仅取实例配置，未配置时返回空字符串。 */
export const getStorageS3CdnEndpoint = () => runtimeStorageConfig?.cdnEndpoint ?? '';

const needExplicitExternalEndpointForRedirect = storageVendor === 'minio';

/**
 * 当前是否具备 short-redirect 的直连条件。
 * MinIO 自建部署必须显式提供客户端可访问的 external endpoint，其它托管厂商自带公网地址。
 */
export const canUseStorageDownloadRedirect = () =>
  !needExplicitExternalEndpointForRedirect || Boolean(getStorageExternalEndpoint());

/**
 * bucket 级别的存储选项。
 * externalEndpoint 依赖运行时实例配置，必须在构造 bucket（而非模块加载）时读取，
 * 因此改由函数返回，避免被模块加载期的常量冻结。
 */
const getBucketStorageOptions = (): BucketStorageOptions => ({
  publicBucket: S3Buckets.public,
  privateBucket: S3Buckets.private,
  externalEndpoint: getStorageExternalEndpoint(),
  publicEndpoint: serviceEnv.STORAGE_R2_PUBLIC_ENDPOINT
});

const awsCompatibleSharedOptions = {
  forcePathStyle: serviceEnv.STORAGE_S3_FORCE_PATH_STYLE,
  maxRetries: serviceEnv.STORAGE_S3_MAX_RETRIES,
  publicAccessExtraSubPath: storagePublicAccessExtraSubPath
};

export function createDefaultStorageOptions() {
  const vendor = serviceEnv.STORAGE_VENDOR as IStorageOptions['vendor'];
  const bucketStorageOptions = getBucketStorageOptions();

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
  const storageS3CdnEndpoint = getStorageS3CdnEndpoint();
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
