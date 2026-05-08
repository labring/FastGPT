import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);
const StorageVendorSchema = z.enum(['minio', 'aws-s3', 'cos', 'oss']);
const StorageCosProtocolSchema = z.enum(['https:', 'http:']);

export const marketplaceEnv = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    NEXT_RUNTIME: z.string().optional(),

    AUTH_TOKEN: z.string().optional().default('marketplace-token'),
    MONGODB_URI: z.string().optional().default(''),
    DB_MAX_LINK: IntSchema.default(20),
    SYNC_INDEX: BoolSchema.default(true),

    // 对象存储。保持与主项目 packages/service/env.ts 同名,并兼容 marketplace 旧 S3_* 变量。
    STORAGE_VENDOR: StorageVendorSchema.default('minio'),
    STORAGE_PUBLIC_BUCKET: z.string().optional(),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_EXTERNAL_ENDPOINT: z.string().optional(),
    STORAGE_S3_ENDPOINT: z.string().optional(),
    STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().optional(),
    STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    STORAGE_S3_FORCE_PATH_STYLE: BoolSchema.default(false),
    STORAGE_S3_MAX_RETRIES: IntSchema.default(3),
    STORAGE_COS_PROTOCOL: StorageCosProtocolSchema.default('https:'),
    STORAGE_COS_USE_ACCELERATE: BoolSchema.default(false),
    STORAGE_COS_CNAME_DOMAIN: z.string().optional(),
    STORAGE_COS_PROXY: z.string().optional(),
    STORAGE_OSS_ENDPOINT: z.string().optional(),
    STORAGE_OSS_CNAME: BoolSchema.default(false),
    STORAGE_OSS_INTERNAL: BoolSchema.default(false),
    STORAGE_OSS_SECURE: BoolSchema.default(false),
    STORAGE_OSS_ENABLE_PROXY: BoolSchema.default(true),
    S3_BUCKET: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),

    // ===== Logging =====
    LOG_ENABLE_CONSOLE: BoolSchema.default(true),
    LOG_CONSOLE_LEVEL: LogLevelSchema.default('debug'),
    LOG_ENABLE_OTEL: BoolSchema.default(false),
    LOG_OTEL_LEVEL: LogLevelSchema.default('info'),
    LOG_OTEL_SERVICE_NAME: z.string().default('fastgpt-marketplace'),
    LOG_OTEL_LOGGER_NAME: z.string().optional(),
    LOG_OTEL_URL: z.url().optional()
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid marketplace environment variables. Please check: ${paths}\n`);
  }
});

const normalizeStorageEndpoint = (endpoint: string | undefined) => {
  if (!endpoint) return undefined;
  return /^https?:\/\//.test(endpoint) ? endpoint : `http://${endpoint}`;
};

export const marketplaceStorageEnv = {
  vendor: marketplaceEnv.STORAGE_VENDOR,
  publicBucket:
    marketplaceEnv.STORAGE_PUBLIC_BUCKET || marketplaceEnv.S3_BUCKET || 'fastgpt-marketplace',
  region: marketplaceEnv.STORAGE_REGION,
  endpoint:
    normalizeStorageEndpoint(marketplaceEnv.STORAGE_S3_ENDPOINT || marketplaceEnv.S3_ENDPOINT) ||
    'http://localhost:9000',
  externalEndpoint: normalizeStorageEndpoint(marketplaceEnv.STORAGE_EXTERNAL_ENDPOINT),
  accessKeyId: marketplaceEnv.STORAGE_ACCESS_KEY_ID || marketplaceEnv.S3_ACCESS_KEY || 'minioadmin',
  secretAccessKey:
    marketplaceEnv.STORAGE_SECRET_ACCESS_KEY || marketplaceEnv.S3_SECRET_KEY || 'minioadmin'
};
