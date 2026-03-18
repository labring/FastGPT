import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const BoolSchema = z
  .string()
  .transform((val) => val === 'true')
  .pipe(z.boolean());

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

export const env = createEnv({
  server: {
    AGENT_SANDBOX_PROVIDER: z.enum(['sealosdevbox', 'opensandbox', 'e2b']).optional(),
    AGENT_SANDBOX_BASE_URL: z.string().url().optional(),
    AGENT_SANDBOX_API_KEY: z.string().optional(),
    AGENT_SANDBOX_E2B_API_KEY: z.string().optional(),
    AGENT_SANDBOX_RUNTIME: z.enum(['kubernetes', 'docker']).optional(),
    AGENT_SANDBOX_SEALOS_BASEURL: z.string().url().optional(),
    AGENT_SANDBOX_SEALOS_TOKEN: z.string().optional(),
    AGENT_SANDBOX_DEFAULT_IMAGE: z.string().optional(),
    AGENT_SANDBOX_DEFAULT_IMAGE_TAG: z.string().optional(),
    AGENT_SANDBOX_WORK_DIRECTORY: z.string().optional(),
    AGENT_SANDBOX_K8S_ENTRYPOINT: z.string().optional(),
    AGENT_SANDBOX_SESSION_K8S_ENTRYPOINT: z.string().optional(),
    AGENT_SANDBOX_DOCKER_ENTRYPOINT: z.string().optional(),
    AGENT_SKILL_MAX_UPLOAD_SIZE: z.coerce.number().optional(),
    AGENT_SKILL_MAX_UNCOMPRESSED_SIZE: z.coerce.number().optional(),
    AGENT_SKILL_MAX_DOWNLOAD_SIZE: z.coerce.number().optional(),
    AGENT_SKILL_MAX_SANDBOX_SIZE: z.coerce.number().optional(),

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
    TRACING_OTEL_SAMPLE_RATIO: z.coerce.number().min(0).max(1).optional()
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});
