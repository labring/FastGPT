import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG,
  AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH: process.env.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH,
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: process.env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
};

const loadSandboxDefaultsModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/runtime/config');
};

describe('sandbox runtime config', () => {
  afterEach(() => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO
    );
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    );
    vi.stubEnv(
      'AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH',
      originalEnv.AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH
    );
    vi.stubEnv(
      'AGENT_SANDBOX_SEALOS_WORK_DIRECTORY',
      originalEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
    );
  });

  it('uses volume mount path as opensandbox work directory', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO', 'runtime-image');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG', 'stable');
    vi.stubEnv('AGENT_SANDBOX_VOLUME_MANAGER_MOUNT_PATH', '/workspace');

    const { getSandboxDefaults } = await loadSandboxDefaultsModule();

    expect(getSandboxDefaults()).toEqual({
      defaultImage: {
        repository: 'runtime-image',
        tag: 'stable'
      },
      workDirectory: '/workspace',
      entrypoint: '/home/sandbox/entrypoint.sh'
    });
  });

  it('uses devbox defaults for sealosdevbox provider', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');

    const { getSandboxDefaults } = await loadSandboxDefaultsModule();

    expect(getSandboxDefaults()).toEqual({
      defaultImage: {
        repository: ''
      },
      workDirectory: '/home/devbox/workspace',
      entrypoint: ''
    });
  });

  it('uses sealos work directory from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_WORK_DIRECTORY', '/custom/devbox/workspace');

    const { getSandboxDefaults } = await loadSandboxDefaultsModule();

    expect(getSandboxDefaults()).toEqual({
      defaultImage: {
        repository: ''
      },
      workDirectory: '/custom/devbox/workspace',
      entrypoint: ''
    });
  });
});
