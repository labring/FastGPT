import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG,
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: process.env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
};

const loadSandboxRuntimeProfileModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/runtime/profile');
};

describe('sandbox runtime profile', () => {
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
      'AGENT_SANDBOX_SEALOS_WORK_DIRECTORY',
      originalEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
    );
  });

  it('uses fixed /workspace as opensandbox work directory', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO', 'runtime-image');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG', 'stable');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile();

    expect(runtimeProfile).toMatchObject({
      provider: 'opensandbox',
      defaultImage: {
        repository: 'runtime-image',
        tag: 'stable'
      },
      workDirectory: '/workspace',
      entrypoint: '/home/sandbox/entrypoint.sh'
    });
    expect(runtimeProfile.skillsRootPath).toBe('/workspace/skills');
  });

  it('uses devbox defaults for sealosdevbox provider', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile();

    expect(runtimeProfile).toMatchObject({
      provider: 'sealosdevbox',
      defaultImage: {
        repository: ''
      },
      workDirectory: '/home/devbox/workspace',
      entrypoint: ''
    });
    expect(runtimeProfile.skillsRootPath).toBe('/home/devbox/workspace/skills');
  });

  it('uses sealos work directory from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_WORK_DIRECTORY', '/custom/devbox/workspace');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();

    expect(getSandboxRuntimeProfile()).toMatchObject({
      provider: 'sealosdevbox',
      defaultImage: {
        repository: ''
      },
      workDirectory: '/custom/devbox/workspace',
      entrypoint: ''
    });
  });

  it('builds provider-specific create config through runtime profile', async () => {
    vi.stubEnv('AGENT_SANDBOX_SEALOS_WORK_DIRECTORY', '/custom/devbox/workspace');

    const { buildBaseSandboxRuntimeEnv, getSandboxRuntimeProfile } =
      await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('sealosdevbox');

    expect(
      runtimeProfile.buildConfig({
        scenario: 'session-runtime',
        sessionId: 'session-1',
        env: buildBaseSandboxRuntimeEnv('session-1', runtimeProfile.workDirectory),
        metadata: { teamId: 'team-1' }
      })
    ).toEqual({
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/custom/devbox/workspace'
      },
      metadata: {
        teamId: 'team-1'
      },
      workingDir: '/custom/devbox/workspace',
      upstreamID: 'session-1'
    });
  });
});
