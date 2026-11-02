import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import { LEAF_ABSENT_SNAPSHOT } from '@test/utils/instanceConfigSnapshot';
import {
  getAgentSandboxProvider,
  getAgentSandboxArchiveInactiveDays,
  getAgentSandboxArchiveMaxBytes,
  getAgentSandboxDiskBytes,
  getAgentSandboxMax,
  getAgentSandboxMaxFileBytes,
  getAgentSandboxMaxPerTeam,
  getAgentSandboxSkillMaxBytes,
  getAgentSandboxSuspendMinutes
} from '@fastgpt/service/core/ai/sandbox/config';

// 叶子缺省快照：读取点回落到 serviceEnv，保持既有 env 驱动的测试意图；
// 需要验证实例配置优先的用例在用例内直接覆写快照叶子。
(global as any).systemInstanceConfig = LEAF_ABSENT_SNAPSHOT();

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

  it('resolves system and per-team quotas with systemEnv priority and independent env fallback', () => {
    // 1. 默认 env 兜底
    serviceEnv.AGENT_SANDBOX_MAX = 42;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
    global.systemEnv = {};
    expect(getAgentSandboxMax()).toBe(42);
    expect(getAgentSandboxMaxPerTeam()).toBe(5);

    // 2. systemEnv 配置优先
    global.systemEnv = { agentSandboxMax: 7, agentSandboxMaxPerTeam: 3 };
    expect(getAgentSandboxMax()).toBe(7);
    expect(getAgentSandboxMaxPerTeam()).toBe(3);

    // 3. 两字段独立回退与清空
    global.systemEnv = { agentSandboxMaxPerTeam: 3 };
    expect(getAgentSandboxMax()).toBe(42);
    expect(getAgentSandboxMaxPerTeam()).toBe(3);

    global.systemEnv = {};
    serviceEnv.AGENT_SANDBOX_MAX = undefined;
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = undefined;
    expect(getAgentSandboxMax()).toBeUndefined();
    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();
  });

  it('does not revive an explicit unlimited per-team quota from env', () => {
    serviceEnv.AGENT_SANDBOX_MAX_PER_TEAM = 5;
    global.systemEnv = { agentSandboxMaxPerTeam: null };

    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();
  });

  it('prefers the instance-config provider and falls back to env only when absent', () => {
    const snapshot = LEAF_ABSENT_SNAPSHOT() as any;
    snapshot.subservice.agentSandbox.provider = 'opensandbox';
    (global as any).systemInstanceConfig = snapshot;

    expect(getAgentSandboxProvider()).toBe('opensandbox');
  });

  it('reads lifecycle thresholds from instance config before env', () => {
    serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES = 90;
    serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS = 14;
    const snapshot = LEAF_ABSENT_SNAPSHOT() as any;
    snapshot.subservice.agentSandbox.common.suspendMinutes = 30;
    snapshot.subservice.agentSandbox.common.archiveInactiveDays = 3;
    (global as any).systemInstanceConfig = snapshot;

    expect(getAgentSandboxSuspendMinutes()).toBe(30);
    expect(getAgentSandboxArchiveInactiveDays()).toBe(3);
  });
});
