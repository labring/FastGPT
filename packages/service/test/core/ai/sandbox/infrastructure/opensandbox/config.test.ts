import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/core/ai/sandbox/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/config')>()),
  getAgentSandboxDiskBytes: () => 10 * 1024 * 1024
}));

import {
  getOpenSandboxClientConfig,
  getOpenSandboxRuntimeConfig
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox/config';

describe('opensandbox config', () => {
  beforeEach(() => {
    const snapshot = createDefaultInstanceConfig();
    snapshot.subservice.agentSandbox.enabled = true;
    Object.assign(snapshot.subservice.agentSandbox.opensandbox, {
      baseUrl: 'https://sandbox.example.com',
      apiKey: 'test-api-key',
      runtime: 'kubernetes',
      useServerProxy: true,
      image: 'registry.example.com/fastgpt/sandbox:v1.0.0',
      cpuOvercommitFactor: 2,
      memoryOvercommitFactor: 2
    });
    Object.assign(snapshot.subservice.agentSandbox.common, {
      storageSizeGi: 10,
      cpuCount: 2,
      memoryMiB: 2048
    });
    (global as any).systemInstanceConfig = snapshot;
  });

  it('throws descriptive errors when OpenSandbox baseUrl or apiKey is missing', () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl = '';
    expect(() => getOpenSandboxClientConfig()).toThrow(
      'OpenSandbox baseUrl is required when Agent Sandbox is enabled'
    );

    getTestInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl =
      'https://sandbox.example.com';
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.apiKey = '';
    expect(() => getOpenSandboxClientConfig()).toThrow(
      'OpenSandbox apiKey is required when Agent Sandbox is enabled'
    );
  });

  it('builds runtime createConfig with base runtime env and supports createConfig image override', () => {
    const result = getOpenSandboxRuntimeConfig({
      volumes: [
        {
          name: 'workspace',
          pvc: { claimName: 'fastgpt-session-sandbox-1-abc' },
          mountPath: '/home/sandbox',
          readOnly: false
        }
      ],
      createConfig: {
        image: 'custom.io/org/sandbox:v2',
        env: { CUSTOM_FLAG: 'yes' }
      }
    });

    expect(result.rawImage).toBe('custom.io/org/sandbox:v2');
    expect(result.image).toEqual({
      repository: 'custom.io/org/sandbox',
      tag: 'v2'
    });
    expect(result.createConfig.volumes).toHaveLength(1);
    // base env 的完整内容由 runtimeProfile.test 覆盖，这里只验证调用方 env 与 base env 合并。
    expect(result.createConfig.env).toMatchObject({
      CUSTOM_FLAG: 'yes',
      HOME: '/home/sandbox'
    });
  });

  it('throws when neither default image nor createConfig image is configured', () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.image = '';

    expect(() => getOpenSandboxRuntimeConfig()).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE is required for OpenSandbox'
    );
  });
});
