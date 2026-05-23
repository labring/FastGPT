import { afterEach, describe, expect, it, vi } from 'vitest';

const loadVolumeConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/volume/config');
};

describe('sandbox volume config', () => {
  afterEach(() => {
    vi.doUnmock('@fastgpt/service/env');
    vi.resetModules();
  });

  it('reads volume-manager configuration from service env', async () => {
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_ENABLE_VOLUME: true,
        AGENT_SANDBOX_VOLUME_MANAGER_URL: 'http://volume-manager.local',
        AGENT_SANDBOX_VOLUME_MANAGER_TOKEN: 'volume-token'
      }
    }));

    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();

    expect(getVolumeManagerEnvConfig()).toEqual({
      enable: true,
      url: 'http://volume-manager.local',
      token: 'volume-token'
    });
  });
});
