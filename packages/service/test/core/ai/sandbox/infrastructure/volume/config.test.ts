import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAF_ABSENT_SNAPSHOT } from '@test/utils/instanceConfigSnapshot';

const loadVolumeConfigModule = async () => {
  vi.resetModules();
  // 叶子缺省快照：volume-manager 连接参数回落到 mock 的环境变量。
  (global as any).systemInstanceConfig = LEAF_ABSENT_SNAPSHOT();
  return import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config');
};

describe('sandbox volume config', () => {
  afterEach(() => {
    vi.doUnmock('@fastgpt/service/env');
    vi.resetModules();
  });

  it('reads volume-manager configuration from service env', async () => {
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: 'http://volume-manager.local',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN: 'volume-token',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX: 'custom-volume',
        AGENT_SANDBOX_STORAGE_SIZE_GI: 5
      }
    }));

    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();

    expect(getVolumeManagerEnvConfig()).toEqual({
      url: 'http://volume-manager.local',
      token: 'volume-token',
      volumeNamePrefix: 'custom-volume',
      storageSize: '5Gi'
    });
  });
  it('requires the volume-manager URL at the configuration boundary', async () => {
    vi.doMock('@fastgpt/service/env', () => ({ serviceEnv: {} }));
    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();
    expect(getVolumeManagerEnvConfig).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL is required'
    );
  });
});
