import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const BoolSchema = z
  .string()
  .transform((val) => val === 'true')
  .pipe(z.boolean());
const PositiveIntSchema = z.coerce.number<number>().int().positive();

export const env = createEnv({
  server: {
    LOG_ENABLE_CONSOLE: BoolSchema.default(true),
    LOG_ENABLE_DEBUG_LEVEL: BoolSchema.default(false),
    LOG_ENABLE_OTEL: BoolSchema.default(false),
    LOG_OTEL_SERVICE_NAME: z.string().default('fastgpt-client'),
    LOG_OTEL_URL: z.url().default('http://localhost:4318/v1/logs'),
    LOG_ENABLE_MONGO_LOG: BoolSchema.default(true)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env
});
