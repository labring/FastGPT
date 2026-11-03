import { createEnv } from '@t3-oss/env-core';
import { BoolSchema, UrlSchema } from '@fastgpt/global/common/zod';

export const appEnv = createEnv({
  server: {
    CHINESE_IP_REDIRECT_URL: UrlSchema.default(''),

    SHOW_GIT: BoolSchema.default(true),
    AGENT_SANDBOX_FREE_TIP: BoolSchema.default(false),
    AGENT_SANDBOX_SHOW_FREE_TIP: BoolSchema.default(false),

    DISABLE_MARKETPLACE: BoolSchema.default(false)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const details = issues
      .map((issue) => {
        const path = issue.path?.join('.') || '<root>';
        return `${path}: ${issue.message}`;
      })
      .join('\n');
    throw new Error(`Invalid app environment variables:\n${details}\n`);
  }
});
