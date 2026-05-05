import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';

export const marketplaceEnv = createEnv({
  server: {
    MONGODB_URI: z.string().default(''),
    DB_MAX_LINK: IntSchema.default(20),
    SYNC_INDEX: BoolSchema.default(true),
    S3_PREFIX: z.string().default(''),
    AUTH_TOKEN: z.string().default('')
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid marketplace environment variables. Please check: ${paths}\n`);
  }
});
