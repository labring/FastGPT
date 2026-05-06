import { createEnv } from '@t3-oss/env-core';
import * as dotenv from 'dotenv';
import { IntSchema, UrlSchema } from '@fastgpt/global/common/zod';

dotenv.config();
dotenv.config({ path: '.env.local' });

export const mcpServerEnv = createEnv({
  server: {
    FASTGPT_ENDPOINT: UrlSchema,
    PORT: IntSchema.default(3000)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid mcp_server environment variables. Please check: ${paths}\n`);
  }
});
