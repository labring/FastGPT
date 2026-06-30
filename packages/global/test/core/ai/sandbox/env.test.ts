import { describe, expect, it } from 'vitest';
import { agentSandboxProviderList } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  agentSandboxProviderRequiredEnvKeys,
  hasAgentSandboxConfig
} from '@fastgpt/global/core/ai/sandbox/env';

describe('agent sandbox env config', () => {
  it('keeps provider list aligned with required env keys', () => {
    expect(Object.keys(agentSandboxProviderRequiredEnvKeys).sort()).toEqual(
      [...agentSandboxProviderList].sort()
    );
  });

  it('requires all provider env keys before enabling agent sandbox', () => {
    expect(
      hasAgentSandboxConfig({
        AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
        AGENT_SANDBOX_SEALOS_BASEURL: 'https://devbox.example.com',
        AGENT_SANDBOX_SEALOS_TOKEN: 'token'
      })
    ).toBe(false);

    expect(
      hasAgentSandboxConfig({
        AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
        AGENT_SANDBOX_SEALOS_BASEURL: 'https://devbox.example.com',
        AGENT_SANDBOX_SEALOS_TOKEN: 'token',
        AGENT_SANDBOX_SEALOS_IMAGE: 'runtime/fastgpt:stable'
      })
    ).toBe(true);
  });

  it('ignores missing or unsupported providers', () => {
    expect(hasAgentSandboxConfig({})).toBe(false);
    expect(hasAgentSandboxConfig({ AGENT_SANDBOX_PROVIDER: 'unknown' })).toBe(false);
  });
});
