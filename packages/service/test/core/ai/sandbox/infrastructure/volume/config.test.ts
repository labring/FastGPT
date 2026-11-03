import {
  createDefaultInstanceConfig,
  getTestInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadVolumeConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/infrastructure/volume/config');
};

describe('sandbox volume config', () => {
  afterEach(() => {
    vi.doUnmock('@fastgpt/service/env');
    vi.resetModules();
  });

  it('reads volume-manager configuration from instance config', async () => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
    Object.assign(getTestInstanceConfig().subservice.agentSandbox.opensandbox, {
      volumeManagerUrl: 'http://volume-manager.local',
      volumeManagerToken: 'volume-token',
      volumeNamePrefix: 'custom-volume'
    });
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 5;

    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();

    expect(getVolumeManagerEnvConfig()).toEqual({
      url: 'http://volume-manager.local',
      token: 'volume-token',
      volumeNamePrefix: 'custom-volume',
      storageSize: '5Gi'
    });
  });
  it('requires the volume-manager URL at the configuration boundary', async () => {
    global.systemInstanceConfig = createDefaultInstanceConfig();
    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();
    expect(getVolumeManagerEnvConfig).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL is required'
    );
  });
});
