import {
  getTestInstanceConfig,
  createDefaultInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAgentSandboxCommonConfig,
  getAgentSandboxDiskBytes,
  getAgentSandboxOpenSandboxConfig,
  getAgentSandboxProxyConfig,
  isAgentSandboxEnabled,
  isAgentSandboxOpenSandboxConfigured
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
  const originalProxy = { ...getAgentSandboxProxyConfig() };

  afterEach(() => {
    getTestInstanceConfig().subservice.agentSandbox.enabled = false;
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi =
      originalAgentSandboxStorageSize;
    getTestInstanceConfig().subservice.agentSandbox.common.suspendMinutes =
      originalAgentSandboxSuspendMinutes;
    getTestInstanceConfig().subservice.agentSandbox.common.archiveInactiveDays =
      originalAgentSandboxArchiveInactiveDays;
    getTestInstanceConfig().subservice.agentSandbox.common.maxEditDebug = originalAgentSandboxMax;
    getTestInstanceConfig().subservice.agentSandbox.common.maxPerTeam =
      originalAgentSandboxMaxPerTeam;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl = '';
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.apiKey = '';
    getTestInstanceConfig().subservice.agentSandbox.proxy = { ...originalProxy };
    vi.unstubAllEnvs();
  });

  it('derives disk bytes from instance config storageSizeGi without reserving fixed system capacity', () => {
    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).storageSizeGi = 1;
    expect(getAgentSandboxDiskBytes()).toBe(1024 * 1024 * 1024);

    ((global as any).systemInstanceConfig.subservice.agentSandbox.common as any).storageSizeGi = 2;
    expect(getAgentSandboxDiskBytes()).toBe(2048 * 1024 * 1024);
  });

  it('reads lifecycle thresholds and quotas from instance config without env revival', () => {
    vi.stubEnv('AGENT_SANDBOX_MAX_PER_TEAM', '5');
    const common = getTestInstanceConfig().subservice.agentSandbox.common;
    common.suspendMinutes = 90;
    common.archiveInactiveDays = 14;
    common.maxEditDebug = 42;
    common.maxPerTeam = 5;

    expect(getAgentSandboxCommonConfig()).toMatchObject({
      suspendMinutes: 90,
      archiveInactiveDays: 14,
      maxEditDebug: 42,
      maxPerTeam: 5
    });

    common.maxPerTeam = null;
    expect(getAgentSandboxCommonConfig().maxPerTeam).toBeNull();
  });

  it('reads the enabled switch and OpenSandbox readiness from instance config', () => {
    expect(isAgentSandboxEnabled()).toBe(false);
    expect(isAgentSandboxOpenSandboxConfigured()).toBe(false);

    const snapshot = createDefaultInstanceConfig() as any;
    snapshot.subservice.agentSandbox.enabled = true;
    snapshot.subservice.agentSandbox.opensandbox.baseUrl = 'https://opensandbox.example.com';
    snapshot.subservice.agentSandbox.opensandbox.apiKey = 'test-key';
    (global as any).systemInstanceConfig = snapshot;

    expect(isAgentSandboxEnabled()).toBe(true);
    expect(isAgentSandboxOpenSandboxConfigured()).toBe(true);
    expect(getAgentSandboxOpenSandboxConfig()).toMatchObject({
      baseUrl: 'https://opensandbox.example.com',
      apiKey: 'test-key'
    });
  });
});

describe('Agent Sandbox proxy configuration', () => {
  afterEach(() => {
    getTestInstanceConfig().subservice.agentSandbox.proxy = {
      wsUrl: '',
      previewUrl: '',
      secret: ''
    };
    vi.unstubAllEnvs();
  });

  it('reads proxy fields only from the live instance snapshot and ignores legacy ENV', () => {
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'wss://legacy.test');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'https://legacy.test');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', 'legacy_secret_32_characters_minimum');
    expect(getAgentSandboxProxyConfig()).toEqual({ wsUrl: '', previewUrl: '', secret: '' });

    Object.assign(getTestInstanceConfig().subservice.agentSandbox.proxy, {
      wsUrl: 'wss://current.test',
      previewUrl: 'https://preview.test',
      secret: 'current_secret_32_characters_minimum'
    });
    expect(getAgentSandboxProxyConfig().wsUrl).toBe('wss://current.test');
    getTestInstanceConfig().subservice.agentSandbox.proxy.wsUrl = 'wss://updated.test';
    expect(getAgentSandboxProxyConfig().wsUrl).toBe('wss://updated.test');
  });
});
