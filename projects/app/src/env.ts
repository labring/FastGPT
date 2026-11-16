import { createEnv } from '@t3-oss/env-core';
import { BoolSchema, UrlSchema } from '@fastgpt/global/common/zod';

export const appEnv = createEnv({
  server: {
    CHINESE_IP_REDIRECT_URL: UrlSchema.default(''),

    SHOW_GIT: BoolSchema.default(false),

    WECOM_LOGIN_AUTO_REDIRECT: BoolSchema.default(false),

    DISABLE_MARKETPLACE: BoolSchema.default(false)
  },
  emptyStringAsUndefined: true,
  runtimeEnv: {
    ...process.env,
    // 开源版固定展示 Git 信息，不读取或校验商业版专用开关。
    SHOW_GIT: process.env.PRO_URL ? process.env.SHOW_GIT : undefined
  },
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
