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

export type AgentSandboxEnvSource = Record<string, string | undefined>;

const isAgentSandboxProvider = (provider: string | undefined): provider is SandboxProviderType =>
  agentSandboxProviderList.includes(provider as SandboxProviderType);

/**
 * 判断系统是否显式配置了 Agent 虚拟机能力。
 * 必须基于原始 env 判断，避免被服务端 env schema 的默认 provider 误判为已启用。
 */
export const hasAgentSandboxConfig = (env: AgentSandboxEnvSource): boolean => {
  const provider = env.AGENT_SANDBOX_PROVIDER;
  if (!isAgentSandboxProvider(provider)) {
    return false;
  }

  return agentSandboxProviderRequiredEnvKeys[provider].every((key) => !!env[key]);
};
