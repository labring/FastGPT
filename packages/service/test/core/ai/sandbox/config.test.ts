import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
  getAgentSandboxArchiveInactiveDays,
  getAgentSandboxArchiveMaxBytes,
  getAgentSandboxDiskBytes,
  getAgentSandboxMax,
  getAgentSandboxMaxFileBytes,
  getAgentSandboxMaxPerTeam,
  getAgentSandboxSkillMaxBytes,
  getAgentSandboxSuspendMinutes
} from '@fastgpt/service/core/ai/sandbox/config';

describe('agent sandbox config', () => {
  const originalAgentSandboxStorageSize = serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI;
  const originalAgentSandboxSuspendMinutes = serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES;
  const originalAgentSandboxArchiveInactiveDays = serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS;
  const originalAgentSandboxMax = serviceEnv.AGENT_SANDBOX_MAX;
  const originalAgentSandboxMaxPerTeam = serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM;
  const originalSystemEnv = global.systemEnv;

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = originalAgentSandboxStorageSize;
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = originalAgentSandboxSuspendMinutes;
    serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS = originalAgentSandboxArchiveInactiveDays;
    serviceEnv.AGENT_SANDBOX_MAX = originalAgentSandboxMax;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = originalAgentSandboxMaxPerTeam;
    global.systemEnv = originalSystemEnv;
  });

  it('derives all size limits from AGENT_SANDBOX_STORAGE_SIZE_GI', () => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 1;
    expect(getAgentSandboxArchiveMaxBytes()).toBe(362 * 1024 * 1024);
    expect(getAgentSandboxDiskBytes()).toBe(362 * 1024 * 1024);
    expect(getAgentSandboxSkillMaxBytes()).toBe(362 * 1024 * 1024);
    expect(getAgentSandboxMaxFileBytes()).toBe(362 * 1024 * 1024);

    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 2;
    expect(getAgentSandboxDiskBytes()).toBe(874 * 1024 * 1024);
  });

  it('rejects storage sizes without enough space for the reserved system capacity', () => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 0.29;
    expect(() => getAgentSandboxDiskBytes()).toThrow('AGENT_SANDBOX_STORAGE_SIZE_GI');
  });

  it('reads lifecycle thresholds from service env', () => {
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = 90;
    serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS = 14;

    expect(getAgentSandboxSuspendMinutes()).toBe(90);
    expect(getAgentSandboxArchiveInactiveDays()).toBe(14);
  });

  it('resolves the system active limit with systemEnv priority and env fallback', () => {
    serviceEnv.AGENT_SANDBOX_MAX = 42;
    expect(getAgentSandboxMax()).toBe(42);

    global.systemEnv = {
      ...global.systemEnv,
      agentSandboxMax: 7
    };
    expect(getAgentSandboxMax()).toBe(7);
  });

  it('resolves the per-team active quota and defaults to unlimited', () => {
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = undefined;
    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();

    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
    expect(getAgentSandboxMaxPerTeam()).toBe(5);

    global.systemEnv = {
      ...global.systemEnv,
      agentSandboxMaxPerTeam: 3
    };
    expect(getAgentSandboxMaxPerTeam()).toBe(3);
  });

  it('does not read sandbox quotas from frontend configuration', () => {
    const originalFeConfigs = global.feConfigs;
    try {
      global.systemEnv = {
        ...global.systemEnv,
        agentSandboxMax: undefined,
        agentSandboxMaxPerTeam: undefined
      };
      global.feConfigs = {
        ...global.feConfigs,
        limit: { ...global.feConfigs?.limit, agentSandboxMax: 1, agentSandboxMaxPerTeam: 1 }
      };
      serviceEnv.AGENT_SANDBOX_MAX = 42;
      serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
      expect(getAgentSandboxMax()).toBe(42);
      expect(getAgentSandboxMaxPerTeam()).toBe(5);
    } finally {
      global.feConfigs = originalFeConfigs;
    }
  });

  it('falls back to env for non-positive or fractional stored quotas', () => {
    for (const value of [0, 1.5]) {
      serviceEnv.AGENT_SANDBOX_MAX = 42;
      serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
      global.systemEnv = {
        ...global.systemEnv,
        agentSandboxMax: value,
        agentSandboxMaxPerTeam: value
      };
      expect(getAgentSandboxMax()).toBe(42);
      expect(getAgentSandboxMaxPerTeam()).toBe(5);
    }
  });
});
