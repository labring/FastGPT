import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
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
  const originalAgentSandboxMax = serviceEnv.AGENT_SANDBOX_MAX;
  const originalAgentSandboxMaxPerTeam = serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM;
  const originalSystemEnv = global.systemEnv;

  afterEach(() => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = originalAgentSandboxStorageSize;
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = originalAgentSandboxSuspendMinutes;
    serviceEnv.AGENT_SANDBOX_MAX = originalAgentSandboxMax;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = originalAgentSandboxMaxPerTeam;
    global.systemEnv = originalSystemEnv;
  });

  it('derives all size limits from AGENT_SANDBOX_STORAGE_SIZE_GI', () => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 1;
    expect(getAgentSandboxDiskBytes()).toBe(874 * 1024 * 1024);
    expect(getAgentSandboxSkillMaxBytes()).toBe(874 * 1024 * 1024);
    expect(getAgentSandboxMaxFileBytes()).toBe(874 * 1024 * 1024);

    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 2;
    expect(getAgentSandboxDiskBytes()).toBe(1898 * 1024 * 1024);
  });

  it('rejects storage sizes without enough space for the reserved system capacity', () => {
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 0.14;
    expect(() => getAgentSandboxDiskBytes()).toThrow('AGENT_SANDBOX_STORAGE_SIZE_GI');
  });

  it('reads lifecycle thresholds from service env', () => {
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = 90;
    expect(getAgentSandboxSuspendMinutes()).toBe(90);
  });

  it('resolves system and per-team quotas with systemEnv priority and independent env fallback', () => {
    serviceEnv.AGENT_SANDBOX_MAX = 42;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
    global.systemEnv = {};
    expect(getAgentSandboxMax()).toBe(42);
    expect(getAgentSandboxMaxPerTeam()).toBe(5);

    global.systemEnv = { agentSandboxMax: 7, agentSandboxMaxPerTeam: 3 };
    expect(getAgentSandboxMax()).toBe(7);
    expect(getAgentSandboxMaxPerTeam()).toBe(3);

    global.systemEnv = { agentSandboxMaxPerTeam: 3 };
    expect(getAgentSandboxMax()).toBe(42);
    expect(getAgentSandboxMaxPerTeam()).toBe(3);

    global.systemEnv = {};
    serviceEnv.AGENT_SANDBOX_MAX = undefined;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = undefined;
    expect(getAgentSandboxMax()).toBeUndefined();
    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();
  });
});
