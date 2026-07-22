import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
  getAgentSandboxArchiveMaxBytes,
  getAgentSandboxMaxFileBytes,
  getAgentSandboxSkillMaxBytes
} from '@fastgpt/service/core/ai/sandbox/config';

describe('agent sandbox config', () => {
  const originalAgentSandboxDiskMB = serviceEnv.AGENT_SANDBOX_DISK_MB;

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_DISK_MB = originalAgentSandboxDiskMB;
  });

  it('derives size limits from AGENT_SANDBOX_DISK_MB', () => {
    serviceEnv.AGENT_SANDBOX_DISK_MB = 1024;
    expect(getAgentSandboxArchiveMaxBytes()).toBe(1024 * 1024 * 1024);
    expect(getAgentSandboxSkillMaxBytes()).toBe(512 * 1024 * 1024);
    expect(getAgentSandboxMaxFileBytes()).toBe(512 * 1024 * 1024);

    serviceEnv.AGENT_SANDBOX_DISK_MB = 333;
    expect(getAgentSandboxArchiveMaxBytes()).toBe(333 * 1024 * 1024);
    expect(getAgentSandboxSkillMaxBytes()).toBe(167 * 1024 * 1024);
    expect(getAgentSandboxMaxFileBytes()).toBe(167 * 1024 * 1024);
  });
});
