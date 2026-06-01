import { createEnv } from '@t3-oss/env-core';
import z from 'zod';
import { BoolSchema, IntSchema, UrlSchema } from '@fastgpt/global/common/zod';
import { hasAgentSandboxConfig } from '@fastgpt/global/core/ai/sandbox/env';

const AgentSandboxProxyUrlSchema = z.string().refine((url) => /^wss?:\/\//.test(url), {
  message: 'AGENT_SANDBOX_PROXY_URL must start with ws:// or wss://'
});

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
    AGENT_SANDBOX_PROXY_URL: AgentSandboxProxyUrlSchema.optional(),
    AGENT_SANDBOX_PROXY_SECRET: z.string().min(32).optional()
  },
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  onValidationError(issues) {
    const paths = issues.map((issue) => issue.path).join(', ');
    throw new Error(`Invalid app environment variables. Please check: ${paths}\n`);
  }
});

if (hasAgentSandboxConfig(process.env)) {
  if (!appEnv.AGENT_SANDBOX_PROXY_URL) {
    throw new Error(
      'AGENT_SANDBOX_PROXY_URL is required when Agent Sandbox is enabled. Please configure a browser-accessible ws:// or wss:// agent-sandbox-proxy URL.'
    );
  }

  if (!appEnv.AGENT_SANDBOX_PROXY_SECRET) {
    throw new Error(
      'AGENT_SANDBOX_PROXY_SECRET is required when Agent Sandbox is enabled. Please configure a strong shared secret for the sandbox proxy.'
    );
  }
}
