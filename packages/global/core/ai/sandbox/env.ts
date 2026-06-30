import { agentSandboxProviderList } from './constants';
import type { SandboxProviderType } from '@fastgpt-sdk/sandbox-adapter';

export const agentSandboxProviderRequiredEnvKeys = {
  sealosdevbox: [
    'AGENT_SANDBOX_SEALOS_BASEURL',
    'AGENT_SANDBOX_SEALOS_TOKEN',
    'AGENT_SANDBOX_SEALOS_IMAGE'
  ],
  opensandbox: ['AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'AGENT_SANDBOX_OPENSANDBOX_API_KEY'],
  e2b: ['AGENT_SANDBOX_E2B_API_KEY']
} satisfies Record<SandboxProviderType, readonly string[]>;

export const agentSandboxProxyRequiredEnvKeys = [
  'AGENT_SANDBOX_PROXY_SECRET',
  'AGENT_SANDBOX_PROXY_URL'
] as const;

export type AgentSandboxEnvSource = Record<string, string | undefined>;

const isAgentSandboxProvider = (provider: string | undefined): provider is SandboxProviderType =>
  agentSandboxProviderList.includes(provider as SandboxProviderType);

/**
 * 判断系统是否显式配置了合法 Agent 虚拟机 provider。
 * 配套环境变量完整性由启动阶段单独校验，避免 provider 已配置但缺少密钥时被误判为未启用。
 */
export const hasAgentSandboxConfig = (env: AgentSandboxEnvSource): boolean => {
  return isAgentSandboxProvider(env.AGENT_SANDBOX_PROVIDER);
};

/**
 * 获取已配置 provider 缺失的运行态必填环境变量。
 * 未配置 provider 时不启用 Agent Sandbox，因此不要求任何 provider 配套变量。
 *
 * 注意：这里不校验主站浏览器直连 proxy 配置；pro/admin 等服务端项目也会导入 serviceEnv，
 * proxy 是否必填应由 FastGPT app 启动流程单独校验。
 */
export const getAgentSandboxMissingRequiredEnvKeys = (env: AgentSandboxEnvSource): string[] => {
  const provider = env.AGENT_SANDBOX_PROVIDER;
  if (!isAgentSandboxProvider(provider)) {
    return [];
  }

  return agentSandboxProviderRequiredEnvKeys[provider].filter((key) => !env[key]);
};

/**
 * 获取 FastGPT app 浏览器直连 agent-sandbox-proxy 缺失的必填环境变量。
 * 该校验只适用于主站 app；pro/admin 不直接暴露 sandbox editor，不应因此阻塞启动。
 */
export const getAgentSandboxMissingProxyRequiredEnvKeys = (
  env: AgentSandboxEnvSource
): string[] => {
  if (!isAgentSandboxProvider(env.AGENT_SANDBOX_PROVIDER)) {
    return [];
  }

  return agentSandboxProxyRequiredEnvKeys.filter((key) => !env[key]);
};
