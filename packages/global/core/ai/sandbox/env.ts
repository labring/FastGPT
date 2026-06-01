export type AgentSandboxEnvSource = Record<string, string | undefined>;

/**
 * 判断系统是否显式配置了 Agent 虚拟机能力。
 * 必须基于原始 env 判断，避免被服务端 env schema 的默认 provider 误判为已启用。
 */
export const hasAgentSandboxConfig = (env: AgentSandboxEnvSource): boolean => {
  const provider = env.AGENT_SANDBOX_PROVIDER;

  if (provider === 'sealosdevbox') {
    return !!(env.AGENT_SANDBOX_SEALOS_BASEURL && env.AGENT_SANDBOX_SEALOS_TOKEN);
  }

  if (provider === 'opensandbox') {
    return !!(env.AGENT_SANDBOX_OPENSANDBOX_BASEURL && env.AGENT_SANDBOX_OPENSANDBOX_API_KEY);
  }

  if (provider === 'e2b') {
    return !!env.AGENT_SANDBOX_E2B_API_KEY;
  }

  return false;
};
