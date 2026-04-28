import { createEnv } from '@t3-oss/env-core';
import z from 'zod';

const truthyBoolStrs = ['true', '1', 'yes', 'y'];
const BoolSchema = z
  .string()
  .transform((val) => truthyBoolStrs.includes(val.toLowerCase()))
  .pipe(z.boolean());

const NumSchema = z.coerce.number<number>();
const IntSchema = NumSchema.int().nonnegative();

// 枚举
const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);
const StorageVendorSchema = z.enum(['minio', 'aws-s3', 'cos', 'oss']);
const StorageCosProtocolSchema = z.enum(['https:', 'http:']);

export const env = createEnv({
  server: {
    FILE_TOKEN_KEY: z.string().min(6, 'FILE_TOKEN_KEY must be at least 6 characters'),

    // ===== Agent sandbox =====
    AGENT_SANDBOX_PROVIDER: z.enum(['sealosdevbox', 'opensandbox', 'e2b']).optional(),
    AGENT_SANDBOX_E2B_API_KEY: z.string().optional(),
    AGENT_SANDBOX_SEALOS_BASEURL: z.string().url().optional(),
    AGENT_SANDBOX_SEALOS_TOKEN: z.string().optional(),

    AGENT_SANDBOX_OPENSANDBOX_BASEURL: z.string().url().optional(),
    AGENT_SANDBOX_OPENSANDBOX_API_KEY: z.string().optional(),
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: z.enum(['docker', 'kubernetes']).default('docker'),
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: z.string().optional(),
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: z.string().default('latest'),
    AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: BoolSchema.default(true),
    AGENT_SANDBOX_ENABLE_VOLUME: BoolSchema.default(false),
    AGENT_SANDBOX_VOLUME_MANAGER_URL: z.string().url().optional(),
    AGENT_SANDBOX_VOLUME_MANAGER_TOKEN: z.string().optional(),
    AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: z.string().default('/workspace'),

    AGENT_SKILL_MAX_UPLOAD_SIZE: NumSchema.optional(),
    AGENT_SKILL_MAX_UNCOMPRESSED_SIZE: NumSchema.optional(),
    AGENT_SKILL_MAX_DOWNLOAD_SIZE: NumSchema.optional(),
    AGENT_SKILL_MAX_SANDBOX_SIZE: NumSchema.optional(),

    AGENT_SANDBOX_MAX_EDIT_DEBUG: NumSchema.optional(),
    AGENT_SANDBOX_MAX_SESSION_RUNTIME: NumSchema.optional(),

    // 对象存储
    STORAGE_VENDOR: StorageVendorSchema.default('minio'),
    STORAGE_PUBLIC_BUCKET: z.string().default('fastgpt-public'),
    STORAGE_PRIVATE_BUCKET: z.string().default('fastgpt-private'),
    STORAGE_REGION: z.string().default('us-east-1'),
    STORAGE_EXTERNAL_ENDPOINT: z.string().optional(),
    STORAGE_S3_ENDPOINT: z.string().default('http://localhost:9000'),
    STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH: z.string().optional(),
    STORAGE_ACCESS_KEY_ID: z.string().default('minioadmin'),
    STORAGE_SECRET_ACCESS_KEY: z.string().default('minioadmin'),
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

    // ===== Logging =====
    LOG_ENABLE_CONSOLE: BoolSchema.default(true),
    LOG_CONSOLE_LEVEL: LogLevelSchema.default('debug'),
    LOG_ENABLE_OTEL: BoolSchema.default(false),
    LOG_OTEL_LEVEL: LogLevelSchema.default('info'),
    LOG_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    LOG_OTEL_URL: z.url().optional(),

    METRICS_ENABLE_OTEL: BoolSchema.default(false),
    METRICS_EXPORT_INTERVAL: NumSchema.int().positive().default(30000),
    METRICS_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    METRICS_OTEL_URL: z.url().optional(),

    TRACING_ENABLE_OTEL: BoolSchema.default(false),
    TRACING_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    TRACING_OTEL_URL: z.url().optional(),
    TRACING_OTEL_SAMPLE_RATIO: NumSchema.min(0).max(1).optional(),

    APP_FOLDER_MAX_AMOUNT: NumSchema.int().positive().default(1000),
    DATASET_FOLDER_MAX_AMOUNT: NumSchema.int().positive().default(1000),

    // ===== Workflow =====
    /** Max length of loop / parallelRun input array. */
    WORKFLOW_MAX_LOOP_TIMES: NumSchema.int()
      .min(1)
      .max(10000)
      .optional()
      .default(100)
      .meta({ description: '循环节点最大循环次数' }),
    /** Env upper bound for parallelRun concurrency. Must not exceed WORKFLOW_MAX_LOOP_TIMES. */
    WORKFLOW_PARALLEL_MAX_CONCURRENCY: NumSchema.int()
      .min(5)
      .max(1000)
      .optional()
      .default(10)
      .meta({ description: '并行节点最大并发数' }),

    // ===== Security =====
    CHECK_INTERNAL_IP: BoolSchema.default(false).meta({ description: '是否启用内网 IP 检查' }),

    /** Redis 流式镜像续期：生成中（秒） */
    STREAM_RESUME_TTL_SECONDS: IntSchema.positive().default(5 * 60),
    /** 流结束后缩短 TTL，便于回收（秒） */
    STREAM_RESUME_POST_COMPLETE_TTL_SECONDS: IntSchema.positive().default(30),
    /** 当 Redis 已用内存 / maxmemory 达到该阈值时，停止为新请求创建流恢复镜像 */
    STREAM_RESUME_REDIS_MAXMEMORY_RATIO: NumSchema.positive().max(1).default(0.5),
    /** Redis 内存水位检测缓存时长（毫秒），避免每个流请求都调用 INFO MEMORY */
    STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS: IntSchema.positive().default(5000),

    // ===== Wechat outLink =====
    /** 微信渠道 poll worker 并发数，需 ≥ online shareId 峰值，否则消息延迟会线性恶化 */
    WECHAT_CHANNEL_CONCURRENCY: NumSchema.int().positive().default(1000).meta({
      description: '微信渠道 poll worker 并发数'
    }),

    // Beta features
    // Whether the Skill feature is enabled (frontend entries + backend runtime)
    SHOW_SKILL: BoolSchema.default(false),

    // Agent engine selection: 'default' uses the built-in Plan+Step engine, 'pi' uses pi-agent-core
    AGENT_ENGINE: z.enum(['default', 'pi']).default('default'),

    SKIP_FILE_TYPE_CHECK: BoolSchema.default(false)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});

if (env.WORKFLOW_PARALLEL_MAX_CONCURRENCY > env.WORKFLOW_MAX_LOOP_TIMES) {
  throw new Error(
    `Invalid environment configuration: WORKFLOW_PARALLEL_MAX_CONCURRENCY (${env.WORKFLOW_PARALLEL_MAX_CONCURRENCY}) must not exceed WORKFLOW_MAX_LOOP_TIMES (${env.WORKFLOW_MAX_LOOP_TIMES})`
  );
}
