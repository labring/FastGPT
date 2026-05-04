import { createEnv } from '@t3-oss/env-core';
import z from 'zod';

const IntSchema = z.coerce.number<number>().int().nonnegative();

export const workerEnv = createEnv({
  server: {
    MAX_HTML_TRANSFORM_CHARS: IntSchema.default(1000000)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env
});
