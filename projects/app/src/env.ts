import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { BoolSchema, IntSchema, UrlSchema } from '@fastgpt/global/common/zod';

export const appEnv = createEnv({
  server: {
    DEFAULT_ROOT_PSW: z.string().default('123456'),
    SSE_MCP_SERVER_PROXY_ENDPOINT: UrlSchema.optional(),

    SYSTEM_NAME: z.string().default('AI'),
    SYSTEM_DESCRIPTION: z.string().default(''),
    SYSTEM_FAVICON: z.string().default(''),
    CHINESE_IP_REDIRECT_URL: UrlSchema.default(''),
    PAY_FORM_URL: UrlSchema.default(''),

    SHOW_COUPON: BoolSchema.default(false),
    SHOW_DISCOUNT_COUPON: BoolSchema.default(false),
    HIDE_CHAT_COPYRIGHT_SETTING: BoolSchema.default(false),
    SHOW_GIT: BoolSchema.default(true),
    WECOM_LOGIN_AUTO_REDIRECT: BoolSchema.default(false),
    AGENT_SANDBOX_FREE_TIP: BoolSchema.default(false),
    AGENT_SANDBOX_SHOW_FREE_TIP: BoolSchema.default(false),
    OPENAPI_KEY_MAX_COUNT: IntSchema.min(1).default(100),

    MARKETPLACE_URL: UrlSchema.default('https://v2.marketplace.fastgpt.cn'),
    DISABLE_MARKETPLACE: BoolSchema.default(false),
    PASSWORD_EXPIRED_MONTH: IntSchema.optional(),

    // 部署绑定配置：需 DNS / 证书配合，或属全站脚本注入，永久由环境变量注入
    CUSTOM_API_DOMAIN: UrlSchema.default(''),
    CUSTOM_SHARE_PAGE_DOMAIN: UrlSchema.default(''),
    SCRIPTS: z.string().optional()
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
