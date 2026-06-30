import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';
import { agentSandboxProviderList } from '@fastgpt/global/core/ai/sandbox/constants';
import z from 'zod';

const TEST_INVOKE_TOKEN_SECRET = 'fastgpt_test_invoke_token_secret_32';
/**
 * 测试套件会在多个 workspace（包含 pro/admin 子模块）里直接导入 serviceEnv。
 * 生产启动仍要求显式配置 INVOKE_TOKEN_SECRET；仅 Vitest/测试环境允许注入稳定测试密钥，
 * 避免每个测试项目都重复维护同一个必填运行时密钥。
 */
export const getRuntimeEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  INVOKE_TOKEN_SECRET:
    process.env.INVOKE_TOKEN_SECRET ??
    (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? TEST_INVOKE_TOKEN_SECRET
      : undefined)
});

/* ===== sandbox ===== */
export const AgentSandboxProxyUrlSchema = z.string().refine((url) => /^wss?:\/\//.test(url), {
  message: 'AGENT_SANDBOX_PROXY_URL must start with ws:// or wss://'
});
const agentSandboxProviderRequiredEnvKeys = {
  sealosdevbox: [
    'AGENT_SANDBOX_SEALOS_BASEURL',
    'AGENT_SANDBOX_SEALOS_TOKEN',
    'AGENT_SANDBOX_SEALOS_IMAGE'
  ],
  opensandbox: [
    'AGENT_SANDBOX_OPENSANDBOX_BASEURL',
    'AGENT_SANDBOX_OPENSANDBOX_API_KEY',
    'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
    'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
  ],
  e2b: ['AGENT_SANDBOX_E2B_API_KEY']
} satisfies Record<SandboxProviderType, readonly string[]>;

export const isAgentSandboxProvider = (
  provider: string | undefined
): provider is SandboxProviderType =>
  agentSandboxProviderList.includes(provider as SandboxProviderType);

/**
 * 获取已配置 provider 缺失的运行态必填环境变量。
 * 未配置合法 provider 时不启用 Agent Sandbox，因此不要求任何 provider 配套变量。
 */
export const getAgentSandboxMissingRequiredEnvKeys = (env: NodeJS.ProcessEnv): string[] => {
  const provider = env.AGENT_SANDBOX_PROVIDER;
  if (!isAgentSandboxProvider(provider)) {
    return [];
  }

  return agentSandboxProviderRequiredEnvKeys[provider].filter((key) => !env[key]);
};

/* ===== Sandbox proxy ===== */
const agentSandboxProxyRequiredEnvKeys = [
  'AGENT_SANDBOX_PROXY_SECRET',
  'AGENT_SANDBOX_PROXY_URL'
] as const;
/**
 * 校验 FastGPT app 浏览器直连 agent-sandbox-proxy 所需环境变量。
 * 该能力只属于主站 app 的 sandbox editor/proxy 链路，不能放在共享 serviceEnv 中校验，
 * 否则 pro/admin 等只复用服务端能力的项目会被不必要的 proxy 配置阻塞。
 */
export const validateAgentSandboxProxyEnv = (): void => {
  const provider = process.env.AGENT_SANDBOX_PROVIDER;
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
