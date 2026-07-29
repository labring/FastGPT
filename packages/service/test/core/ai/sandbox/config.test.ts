import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
  getAgentSandboxArchiveInactiveDays,
  getAgentSandboxArchiveMaxBytes,
  getAgentSandboxMaxFileBytes,
  getAgentSandboxSkillMaxBytes,
  getAgentSandboxSuspendMinutes
} from '@fastgpt/service/core/ai/sandbox/config';

describe('agent sandbox config', () => {
  const originalAgentSandboxDiskMB = serviceEnv.AGENT_SANDBOX_DISK_MB;
  const originalAgentSandboxSuspendMinutes = serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES;
  const originalAgentSandboxArchiveInactiveDays = serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS;

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_DISK_MB = originalAgentSandboxDiskMB;
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = originalAgentSandboxSuspendMinutes;
    serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS = originalAgentSandboxArchiveInactiveDays;
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

  it('reads lifecycle thresholds from service env', () => {
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = 90;
    serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS = 14;

    expect(getAgentSandboxSuspendMinutes()).toBe(90);
    expect(getAgentSandboxArchiveInactiveDays()).toBe(14);
  });
});
