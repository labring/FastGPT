import { describe, expect, it } from 'vitest';
import {
  getAgentSandboxMissingRequiredEnvKeys,
  hasAgentSandboxConfig
} from '@fastgpt/global/core/ai/sandbox/env';

describe('agent sandbox env config', () => {
  it('detects provider config separately from missing required env keys', () => {
    expect(hasAgentSandboxConfig({ AGENT_SANDBOX_PROVIDER: 'sealosdevbox' })).toBe(true);
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
        AGENT_SANDBOX_SEALOS_BASEURL: 'https://devbox.example.com',
        AGENT_SANDBOX_SEALOS_TOKEN: 'token'
      })
    ).toContain('AGENT_SANDBOX_SEALOS_IMAGE');
  });

  it('ignores missing or unsupported providers', () => {
    expect(hasAgentSandboxConfig({})).toBe(false);
    expect(hasAgentSandboxConfig({ AGENT_SANDBOX_PROVIDER: 'unknown' })).toBe(false);
    expect(getAgentSandboxMissingRequiredEnvKeys({})).toEqual([]);
    expect(getAgentSandboxMissingRequiredEnvKeys({ AGENT_SANDBOX_PROVIDER: 'unknown' })).toEqual(
      []
    );
  });
});
