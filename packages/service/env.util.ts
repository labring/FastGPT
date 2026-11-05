import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import { agentSandboxProviderList } from '@fastgpt/global/core/ai/sandbox/constants';
import { isHttpUrl } from '@fastgpt/global/common/string/url';
import z from 'zod';
import type { StorageVendorSchema } from './env.const';

const TEST_INVOKE_TOKEN_SECRET = 'fastgpt_test_invoke_token_secret_32';
const TEST_PRO_TOKEN = 'fastgpt_test_pro_token_32_chars_min';
/**
 * 测试套件会在多个 workspace（包含 pro/admin 子模块）里直接导入 serviceEnv。
 * INVOKE_TOKEN_SECRET 生产启动要求显式配置；PRO_TOKEN 仅在启用 Pro 内部调用时配置。
 * 仅 Vitest/测试环境允许注入稳定测试密钥，避免每个测试项目都重复维护同一组运行时密钥。
 */
export const getRuntimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  INVOKE_TOKEN_SECRET:
    process.env.INVOKE_TOKEN_SECRET ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? TEST_INVOKE_TOKEN_SECRET
      : undefined),
  PRO_TOKEN:
    process.env.PRO_TOKEN ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test' ? TEST_PRO_TOKEN : undefined)
});

/* ===== S3 ===== */
/** 只校验对象存储基础设施 ENV；下载模式、external endpoint、CDN 的约束由实例配置校验负责。 */
export const validateS3Env = (env: {
  STORAGE_VENDOR: z.infer<typeof StorageVendorSchema>;
  STORAGE_R2_PUBLIC_ENDPOINT?: string;
}): void => {
  if (env.STORAGE_VENDOR === 'r2' && !env.STORAGE_R2_PUBLIC_ENDPOINT) {
    throw new Error(
      'Invalid S3 environment variables: STORAGE_R2_PUBLIC_ENDPOINT is required when STORAGE_VENDOR is r2.'
    );
  }
};

/* ===== sandbox ===== */
export const AgentSandboxProxyUrlSchema = z.string().refine((url) => /^wss?:\/\//.test(url), {
  message: 'AGENT_SANDBOX_PROXY_URL must start with ws:// or wss://'
});
export const AgentSandboxPreviewProxyUrlSchema = z.string().refine(isHttpUrl, {
  message: 'AGENT_SANDBOX_PREVIEW_PROXY_URL must start with http:// or https://'
});
export const isAgentSandboxProvider = (
  provider: string | undefined
): provider is SandboxProviderType =>
  agentSandboxProviderList.includes(provider as SandboxProviderType);

/* ===== Sandbox proxy ===== */
const agentSandboxProxyRequiredEnvKeys = [
  'AGENT_SANDBOX_PROXY_SECRET',
  'AGENT_SANDBOX_PROXY_URL',
  'AGENT_SANDBOX_PREVIEW_PROXY_URL'
] as const;
/**
 * 校验 FastGPT app 浏览器直连 agent-sandbox-proxy 所需环境变量。
 * provider 必须来自迁移后加载的实例配置，不能再读取已退役的 AGENT_SANDBOX_PROVIDER。
 * 该能力只属于主站 app 的 sandbox editor/proxy 链路，不能放在共享 serviceEnv 中校验，
 * 否则 pro/admin 等只复用服务端能力的项目会被不必要的 proxy 配置阻塞。
 */
export const validateAgentSandboxProxyEnv = (provider: string): void => {
  if (!agentSandboxProviderList.includes(provider as (typeof agentSandboxProviderList)[number])) {
    return;
  }

  const missingAgentSandboxProxyEnvKeys = agentSandboxProxyRequiredEnvKeys.filter(
    (key) => !process.env[key]
  );
  if (missingAgentSandboxProxyEnvKeys.length === 0) {
    return;
  }

  throw new Error(
    `Invalid Agent Sandbox proxy environment variables: ${missingAgentSandboxProxyEnvKeys.join(
      ', '
    )} are required when AGENT_SANDBOX_PROVIDER is ${provider}.`
  );
};

/**
 * 校验复用 Sandbox 文件预览能力的服务所需环境变量。
 * Pro Admin 不提供 sandbox editor/proxy 链路，因此只要求文件预览代理地址。
 */
export const validateAgentSandboxPreviewProxyEnv = (provider: string): void => {
  if (!agentSandboxProviderList.includes(provider as (typeof agentSandboxProviderList)[number])) {
    return;
  }

  if (process.env.AGENT_SANDBOX_PREVIEW_PROXY_URL) {
    return;
  }

  throw new Error(
    `Invalid Agent Sandbox preview proxy environment variable: AGENT_SANDBOX_PREVIEW_PROXY_URL is required when AGENT_SANDBOX_PROVIDER is ${provider}.`
  );
};

/**
 * 校验 Agent 用户初始化环境变量。
 * 当配置了 AGENT_USERS 时，必须提供初始密码 DEFAULT_AGENT_PSW。
 */
export const validateAgentUsersEnv = (env: {
  AGENT_USERS?: string;
  DEFAULT_AGENT_PSW?: string;
}): void => {
  const agentUsernames = env.AGENT_USERS?.split(',')
    .map((username) => username.trim())
    .filter(Boolean);

  if (agentUsernames?.length && !env.DEFAULT_AGENT_PSW) {
    throw new Error(
      'Invalid environment configuration: DEFAULT_AGENT_PSW is required when AGENT_USERS is configured.'
    );
  }
};
