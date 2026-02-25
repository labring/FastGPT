import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const BoolSchema = z
  .string()
  .transform((val) => val === 'true')
  .pipe(z.boolean());

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warning', 'error', 'fatal']);

export const env = createEnv({
  server: {
    LOG_ENABLE_CONSOLE: BoolSchema.default(true),
    LOG_CONSOLE_LEVEL: LogLevelSchema.default('trace'),

    LOG_ENABLE_OTEL: BoolSchema.default(false),
    LOG_OTEL_LEVEL: LogLevelSchema.default('info'),
    LOG_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    LOG_OTEL_URL: z.url().default('http://localhost:4318/v1/logs')
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid environment variables. Please check: ${paths}\n`);
  }
});
