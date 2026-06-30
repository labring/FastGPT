import { describe, expect, it } from 'vitest';

import { getAgentSandboxMissingRequiredEnvKeys } from '@fastgpt/service/env.util';

describe('env util', () => {
  it('requires opensandbox volume manager env when opensandbox provider is enabled', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_PROVIDER: 'opensandbox',
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
        AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'opensandbox-key'
      } as NodeJS.ProcessEnv)
    ).toEqual([
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
    ]);
  });

  it('does not require opensandbox volume manager env for other providers', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_PROVIDER: 'e2b',
        AGENT_SANDBOX_E2B_API_KEY: 'e2b-key'
      } as NodeJS.ProcessEnv)
    ).toEqual([]);
  });
});
