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

    AGENT_SANDBOX_E2B_API_KEY: z.string().optional(),

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
    DATASET_FOLDER_MAX_AMOUNT: z.coerce.number().int().positive().default(1000),

    /** Loop/batch 输入数组最大长度；未设置或非法时按 100 */
    WORKFLOW_MAX_LOOP_TIMES: z.preprocess((val) => {
      const n = Number(val);
      return Number.isInteger(n) && n > 0 ? n : 100;
    }, z.number().int().positive()),
    /** 批处理并行上限；未设置或非法时按 10 */
    WORKFLOW_BATCH_MAX_CONCURRENCY: z.preprocess((val) => {
      const n = Number(val);
      return Number.isInteger(n) && n > 0 ? n : 10;
    }, z.number().int().positive()),
    /** 批处理重试次数上限；未设置或非法时按 5 */
    WORKFLOW_BATCH_MAX_RETRY: z.preprocess((val) => {
      const n = Number(val);
      return Number.isInteger(n) && n >= 0 ? n : 5;
    }, z.number().int().min(0))
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});
