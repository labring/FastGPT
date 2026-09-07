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

  it('reads volume-manager configuration from service env', async () => {
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_ENABLE: true,
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: 'http://volume-manager.local',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN: 'volume-token',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX: 'custom-volume',
        AGENT_SANDBOX_STORAGE_SIZE_GI: 5
      }
    }));

    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();

    expect(getVolumeManagerEnvConfig()).toEqual({
      enable: true,
      url: 'http://volume-manager.local',
      token: 'volume-token',
      volumeNamePrefix: 'custom-volume',
      storageSize: '5Gi'
    });
  });

  it('disables the volume manager when AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_ENABLE=false', async () => {
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_ENABLE: false,
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: 'http://volume-manager.local',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX: 'custom-volume',
        AGENT_SANDBOX_STORAGE_SIZE_GI: 5
      }
    }));

    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();

    const config = getVolumeManagerEnvConfig();
    expect(config.enable).toBe(false);
  });

  it('disables the volume manager when no volume-manager URL is configured', async () => {
    // K8s env-injection timing or a missing deployment leaves the URL undefined:
    // without this guard the undefined prefix/URL would flow into claimName
    // generation and Zod validation (issue #7664).
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_ENABLE: true,
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: undefined,
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX: 'custom-volume',
        AGENT_SANDBOX_STORAGE_SIZE_GI: 5
      }
    }));

    const { getVolumeManagerEnvConfig } = await loadVolumeConfigModule();

    const config = getVolumeManagerEnvConfig();
    expect(config.enable).toBe(false);
  });
});
