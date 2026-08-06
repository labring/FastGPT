import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: process.env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY,
  AGENT_SANDBOX_SEALOS_IMAGE: process.env.AGENT_SANDBOX_SEALOS_IMAGE,
  AGENT_SANDBOX_STORAGE_SIZE_GI: process.env.AGENT_SANDBOX_STORAGE_SIZE_GI
};

const loadSandboxRuntimeProfileModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile');
};

describe('sandbox runtime profile', () => {
  afterEach(() => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE);
    vi.stubEnv(
      'AGENT_SANDBOX_SEALOS_WORK_DIRECTORY',
      originalEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
    );
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', originalEnv.AGENT_SANDBOX_SEALOS_IMAGE);
    vi.stubEnv('AGENT_SANDBOX_STORAGE_SIZE_GI', originalEnv.AGENT_SANDBOX_STORAGE_SIZE_GI);
  });

  it('uses fixed /workspace as opensandbox work directory', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'registry.local:5000/runtime-image:stable');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

    expect(runtimeProfile).toMatchObject({
      provider: 'opensandbox',
      defaultImage: {
        repository: 'registry.local:5000/runtime-image',
        tag: 'stable'
      },
      workDirectory: '/workspace',
      entrypoint: '/home/sandbox/entrypoint.sh'
    });
    expect(runtimeProfile.skillsRootPath).toBe('/workspace/skills');
  });

  it('preserves an explicit opensandbox ready timeout', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

    expect(
      runtimeProfile.buildConfig({
        createConfig: { readyTimeoutSeconds: 45 }
      })
    ).toMatchObject({ readyTimeoutSeconds: 45 });
    expect(runtimeProfile.buildConfig()).toMatchObject({ readyTimeoutSeconds: 120 });
  });

  it('uses devbox defaults for sealosdevbox provider', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', 'runtime/fastgpt:stable');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('sealosdevbox');

    expect(runtimeProfile).toMatchObject({
      provider: 'sealosdevbox',
      defaultImage: {
        repository: 'runtime/fastgpt',
        tag: 'stable'
      },
      workDirectory: '/home/devbox/workspace',
      entrypoint: ''
    });
    expect(runtimeProfile.skillsRootPath).toBe('/home/devbox/workspace/skills');
  });

  it('uses sealos work directory from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_WORK_DIRECTORY', '/custom/devbox/workspace');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_STORAGE_SIZE_GI', '1');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();

    expect(getSandboxRuntimeProfile('sealosdevbox')).toMatchObject({
      provider: 'sealosdevbox',
      workDirectory: '/custom/devbox/workspace',
      entrypoint: ''
    });
  });

  it('builds provider-specific create config through runtime profile', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_WORK_DIRECTORY', '/custom/devbox/workspace');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', 'runtime/fastgpt:stable');

    const { buildBaseSandboxRuntimeEnv, getSandboxRuntimeProfile } =
      await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('sealosdevbox');

    expect(
      runtimeProfile.buildConfig({
        scenario: 'session-runtime',
        sessionId: 'session-1',
        env: buildBaseSandboxRuntimeEnv({
          sessionId: 'session-1',
          workDirectory: runtimeProfile.workDirectory,
          ideAgentMaxFileBytes: 10 * 1024 * 1024,
          ideAgentWsLimits: {
            maxMessageBytes: 64 * 1024 * 1024,
            maxFrameBytes: 16 * 1024 * 1024
          }
        }),
        metadata: { teamId: 'team-1' }
      })
    ).toMatchObject({
      image: {
        repository: 'runtime/fastgpt',
        tag: 'stable'
      },
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/custom/devbox/workspace',
        IDE_AGENT_ENABLED: 'true',
        DEVBOX_SDK_MAX_FILE_SIZE: '379584512',
        FASTGPT_IDE_MAX_FILE_BYTES: '10485760',
        FASTGPT_IDE_WS_MAX_MESSAGE_BYTES: '67108864',
        FASTGPT_IDE_WS_MAX_FRAME_BYTES: '16777216'
      },
      metadata: {
        teamId: 'team-1'
      },
      workingDir: '/custom/devbox/workspace',
      upstreamID: 'session-1'
    });
  });
});
