import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { BoolSchema, IntSchema, UrlSchema } from '@fastgpt/global/common/zod';

const hasAgentSandboxConfig = () => {
  // 与 serviceEnv.hasAgentSandboxConfig 保持一致；show_agent_sandbox 由这组原始 env 推导。
  const provider = process.env.AGENT_SANDBOX_PROVIDER;

  if (provider === 'sealosdevbox') {
    return !!(process.env.AGENT_SANDBOX_SEALOS_BASEURL && process.env.AGENT_SANDBOX_SEALOS_TOKEN);
  }

  if (provider === 'opensandbox') {
    return !!(
      process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL && process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY
    );
  }

  if (provider === 'e2b') {
    return !!process.env.AGENT_SANDBOX_E2B_API_KEY;
  }

  return false;
};

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

    // 临时
    MARKETPLACE_URL: UrlSchema.default('https://v2.marketplace.fastgpt.cn'),
    PASSWORD_EXPIRED_MONTH: IntSchema.optional(),
    AGENT_SANDBOX_PROXY_URL: z.string().optional()
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid app environment variables. Please check: ${paths}\n`);
  }
});

if (hasAgentSandboxConfig() && !appEnv.AGENT_SANDBOX_PROXY_URL) {
  throw new Error(
    'AGENT_SANDBOX_PROXY_URL is required when Agent Sandbox is enabled. Please configure a browser-accessible ws:// or wss:// agent-sandbox-proxy URL.'
  );
}
