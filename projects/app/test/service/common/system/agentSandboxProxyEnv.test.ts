import { describe, expect, it } from 'vitest';
import { validateAgentSandboxProxyEnv } from '@/service/common/system/agentSandboxProxyEnv';

describe('validateAgentSandboxProxyEnv', () => {
  it('未启用 Agent Sandbox 时允许 proxy 配置为空', () => {
    expect(() => validateAgentSandboxProxyEnv({})).not.toThrow();
  });

  it('主站启用 Agent Sandbox 时要求配置 browser proxy 环境变量', () => {
    expect(() =>
      validateAgentSandboxProxyEnv({
        AGENT_SANDBOX_PROVIDER: 'sealosdevbox'
      })
    ).toThrow(
      'AGENT_SANDBOX_PROXY_SECRET, AGENT_SANDBOX_PROXY_URL are required when AGENT_SANDBOX_PROVIDER is sealosdevbox'
    );
  });
});
