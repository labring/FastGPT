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
  const originalFeConfigs = global.feConfigs;

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = originalAgentSandboxStorageSize;
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = originalAgentSandboxSuspendMinutes;
    serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS = originalAgentSandboxArchiveInactiveDays;
    serviceEnv.AGENT_SANDBOX_MAX = originalAgentSandboxMax;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = originalAgentSandboxMaxPerTeam;
    global.feConfigs = originalFeConfigs;
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

  it('resolves the system active limit with feConfigs priority and env fallback', () => {
    serviceEnv.AGENT_SANDBOX_MAX = 42;
    expect(getAgentSandboxMax()).toBe(42);

    global.feConfigs = {
      ...global.feConfigs,
      limit: { ...global.feConfigs?.limit, agentSandboxMax: 7 }
    } as any;
    expect(getAgentSandboxMax()).toBe(7);

    // 管理台误存 0 等非法值时不收紧配额，回退 env。
    global.feConfigs = {
      ...global.feConfigs,
      limit: { ...global.feConfigs?.limit, agentSandboxMax: 0 }
    } as any;
    expect(getAgentSandboxMax()).toBe(42);
  });

  it('resolves the per-team active quota and defaults to unlimited', () => {
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = undefined;
    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();

    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
    expect(getAgentSandboxMaxPerTeam()).toBe(5);

    global.feConfigs = {
      ...global.feConfigs,
      limit: { ...global.feConfigs?.limit, agentSandboxMaxPerTeam: 3 }
    } as any;
    expect(getAgentSandboxMaxPerTeam()).toBe(3);
  });
});
