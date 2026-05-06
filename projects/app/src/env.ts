import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { BoolSchema, IntSchema, UrlSchema } from '@fastgpt/global/common/zod';

export const appEnv = createEnv({
  server: {
    DEFAULT_ROOT_PSW: z.string().default('123456'),
    CONFIG_JSON_PATH: z.string().optional(),
    SYSTEM_NAME: z.string().default('AI'),
    SYSTEM_DESCRIPTION: z.string().default(''),
    SYSTEM_FAVICON: z.string().default(''),
    CHINESE_IP_REDIRECT_URL: UrlSchema.default(''),
    PAY_FORM_URL: UrlSchema.default(''),

    SHOW_COUPON: BoolSchema.default(false),
    SHOW_DISCOUNT_COUPON: BoolSchema.default(false),
    HIDE_CHAT_COPYRIGHT_SETTING: BoolSchema.default(false),
    AGENT_SANDBOX_FREE_TIP: BoolSchema.default(false),

    MARKETPLACE_URL: UrlSchema.default('https://marketplace.fastgpt.cn'),
    PASSWORD_EXPIRED_MONTH: IntSchema.optional()
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid app environment variables. Please check: ${paths}\n`);
  }
});
