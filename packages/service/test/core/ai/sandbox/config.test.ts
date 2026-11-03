import {
  getTestInstanceConfig,
  createDefaultInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

// 需要验证实例配置优先的用例在用例内直接覆写快照叶子。
(global as any).systemInstanceConfig = createDefaultInstanceConfig();

describe('agent sandbox config', () => {
  const originalAgentSandboxStorageSize =
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi;
  const originalAgentSandboxSuspendMinutes =
    getTestInstanceConfig().subservice.agentSandbox.common.suspendMinutes;
  const originalAgentSandboxArchiveInactiveDays =
    getTestInstanceConfig().subservice.agentSandbox.common.archiveInactiveDays;
  const originalAgentSandboxMax =
    getTestInstanceConfig().subservice.agentSandbox.common.maxEditDebug;
  const originalAgentSandboxMaxPerTeam =
    getTestInstanceConfig().subservice.agentSandbox.common.maxPerTeam;
  const originalSystemEnv = global.systemEnv;

  afterEach(() => {
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi =
      originalAgentSandboxStorageSize;
    getTestInstanceConfig().subservice.agentSandbox.common.suspendMinutes =
      originalAgentSandboxSuspendMinutes;
    getTestInstanceConfig().subservice.agentSandbox.common.archiveInactiveDays =
      originalAgentSandboxArchiveInactiveDays;
    getTestInstanceConfig().subservice.agentSandbox.common.maxEditDebug = originalAgentSandboxMax;
    getTestInstanceConfig().subservice.agentSandbox.common.maxPerTeam =
      originalAgentSandboxMaxPerTeam;
    global.systemEnv = originalSystemEnv;
    vi.unstubAllEnvs();
  });

  it('derives all size limits from instance config storageSizeGi', () => {
    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).storageSizeGi = 1;
    expect(getAgentSandboxArchiveMaxBytes()).toBe(362 * 1024 * 1024);
    expect(getAgentSandboxDiskBytes()).toBe(362 * 1024 * 1024);
    expect(getAgentSandboxSkillMaxBytes()).toBe(362 * 1024 * 1024);
    expect(getAgentSandboxMaxFileBytes()).toBe(362 * 1024 * 1024);

    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).storageSizeGi = 2;
    expect(getAgentSandboxDiskBytes()).toBe(874 * 1024 * 1024);
  });

  it('rejects storage sizes without enough space for the reserved system capacity', () => {
    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).storageSizeGi =
      0.29;
    expect(() => getAgentSandboxDiskBytes()).toThrow('AGENT_SANDBOX_STORAGE_SIZE_GI');
  });

  it('reads lifecycle thresholds from instance config', () => {
    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).suspendMinutes =
      90;
    (
      (global as any).systemInstanceConfig.subservice.agentSandbox.common as any
    ).archiveInactiveDays = 14;

    expect(getAgentSandboxSuspendMinutes()).toBe(90);
    expect(getAgentSandboxArchiveInactiveDays()).toBe(14);
  });

  it('resolves system and per-team quotas from instance config', () => {
    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).maxEditDebug = 42;
    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).maxPerTeam = 5;
    expect(getAgentSandboxMax()).toBe(42);
    expect(getAgentSandboxMaxPerTeam()).toBe(5);

    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).maxPerTeam = null;
    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();
  });

  it('does not revive an explicit unlimited per-team quota from env', () => {
    vi.stubEnv('AGENT_SANDBOX_MAX_PER_TEAM', '5');
    getTestInstanceConfig().subservice.agentSandbox.common.maxPerTeam = null;
    global.systemEnv = { agentSandboxMaxPerTeam: null };

    expect(getAgentSandboxMaxPerTeam()).toBeUndefined();
  });

  it('reads the provider only from instance config', () => {
    const snapshot = createDefaultInstanceConfig() as any;
    snapshot.subservice.agentSandbox.provider = 'opensandbox';
    (global as any).systemInstanceConfig = snapshot;

    expect(getAgentSandboxProvider()).toBe('opensandbox');
  });

  it('reads lifecycle thresholds from instance config before env', () => {
    getTestInstanceConfig().subservice.agentSandbox.common.suspendMinutes = 90;
    getTestInstanceConfig().subservice.agentSandbox.common.archiveInactiveDays = 14;
    const snapshot = createDefaultInstanceConfig() as any;
    snapshot.subservice.agentSandbox.common.suspendMinutes = 30;
    snapshot.subservice.agentSandbox.common.archiveInactiveDays = 3;
    (global as any).systemInstanceConfig = snapshot;

    expect(getAgentSandboxSuspendMinutes()).toBe(30);
    expect(getAgentSandboxArchiveInactiveDays()).toBe(3);
  });
});
