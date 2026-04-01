import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const BoolSchema = z
  .string()
  .transform((val) => val === 'true')
  .pipe(z.boolean());

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

export const env = createEnv({
  server: {
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
    AGENT_SANDBOX_OPENSANDBOX_WORK_DIRECTORY: z.string().optional(),
    AGENT_SANDBOX_OPENSANDBOX_TARGET_PORT: z.coerce.number().optional(),
    AGENT_SANDBOX_OPENSANDBOX_ENTRYPOINT: z.string().optional(),
    AGENT_SANDBOX_ENABLE_VOLUME: BoolSchema.default(false),
    AGENT_SANDBOX_VOLUME_MANAGER_URL: z.string().url().optional(),
    AGENT_SANDBOX_VOLUME_MANAGER_TOKEN: z.string().optional(),
    AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: z.string().default('/workspace'),

    AGENT_SKILL_MAX_UPLOAD_SIZE: z.coerce.number().optional(),
    AGENT_SKILL_MAX_UNCOMPRESSED_SIZE: z.coerce.number().optional(),
    AGENT_SKILL_MAX_DOWNLOAD_SIZE: z.coerce.number().optional(),
    AGENT_SKILL_MAX_SANDBOX_SIZE: z.coerce.number().optional(),

    AGENT_SANDBOX_MAX_EDIT_DEBUG: z.coerce.number().optional(),
    AGENT_SANDBOX_MAX_SESSION_RUNTIME: z.coerce.number().optional(),

    // ===== Logging =====
    LOG_ENABLE_CONSOLE: BoolSchema.default(true),
    LOG_CONSOLE_LEVEL: LogLevelSchema.default('debug'),
    LOG_ENABLE_OTEL: BoolSchema.default(false),
    LOG_OTEL_LEVEL: LogLevelSchema.default('info'),
    LOG_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    LOG_OTEL_URL: z.url().optional(),

    METRICS_ENABLE_OTEL: BoolSchema.default(false),
    METRICS_EXPORT_INTERVAL: z.coerce.number().int().positive().default(15000),
    METRICS_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    METRICS_OTEL_URL: z.url().optional(),

    TRACING_ENABLE_OTEL: BoolSchema.default(false),
    TRACING_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    TRACING_OTEL_URL: z.url().optional(),
    TRACING_OTEL_SAMPLE_RATIO: z.coerce.number().min(0).max(1).optional(),

    APP_FOLDER_MAX_AMOUNT: z.coerce.number().int().positive().default(1000),
    DATASET_FOLDER_MAX_AMOUNT: z.coerce.number().int().positive().default(1000)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});
