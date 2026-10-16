import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: process.env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY,
  AGENT_SANDBOX_SEALOS_IMAGE: process.env.AGENT_SANDBOX_SEALOS_IMAGE,
  AGENT_SANDBOX_STORAGE_SIZE_GI: process.env.AGENT_SANDBOX_STORAGE_SIZE_GI,
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
  AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: process.env.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR,
  AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: process.env.AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR,
  AGENT_SANDBOX_CPU_COUNT: process.env.AGENT_SANDBOX_CPU_COUNT,
  AGENT_SANDBOX_MEMORY_MIB: process.env.AGENT_SANDBOX_MEMORY_MIB
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
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', originalEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME);
    vi.stubEnv(
      'AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR',
      originalEnv.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR
    );
    vi.stubEnv(
      'AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR',
      originalEnv.AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR
    );
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', originalEnv.AGENT_SANDBOX_CPU_COUNT);
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', originalEnv.AGENT_SANDBOX_MEMORY_MIB);
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

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const { buildBaseSandboxRuntimeEnv } =
      await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile/utils');
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

  it('derives kubernetes resource requests from the final resource limits', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '2');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '4096');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

    expect(runtimeProfile.buildConfig()).toMatchObject({
      resourceLimits: { cpuCount: 2, memoryMiB: 4096 },
      resourceRequests: { cpuCount: 0.2, memoryMiB: 409 }
    });
    // 显式 limits 覆盖时按最终 limits 派生，而不是 env 默认值。
    expect(
      runtimeProfile.buildConfig({ resourceLimits: { cpuCount: 1, memoryMiB: 2048 } })
    ).toMatchObject({
      resourceLimits: { cpuCount: 1, memoryMiB: 2048 },
      resourceRequests: { cpuCount: 0.1, memoryMiB: 204 }
    });
  });

  it('keeps guaranteed QoS when both overcommit factors are the default 1', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

    expect(runtimeProfile.buildConfig()).toMatchObject({
      resourceLimits: { cpuCount: 1, memoryMiB: 2048 }
    });
    expect(runtimeProfile.buildConfig()?.resourceRequests).toBeUndefined();
  });

  it('skips resource requests for docker runtime even with an explicit override', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'docker');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '10');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

    const result = runtimeProfile.buildConfig({
      createConfig: { resourceRequests: { cpuCount: 1, memoryMiB: 512 } }
    });

    expect(result).toBeDefined();
    expect(result).not.toHaveProperty('resourceRequests');
  });

  it('prefers an explicit resourceRequests override over the derived value', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '5');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '5');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '2');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '4096');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

    expect(
      runtimeProfile.buildConfig({
        createConfig: { resourceRequests: { cpuCount: 0.5, memoryMiB: 1024 } }
      })
    ).toMatchObject({
      resourceRequests: { cpuCount: 0.5, memoryMiB: 1024 }
    });
  });

  it('floors cpu to millicores and memory to MiB when deriving requests', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '3');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '3');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '1');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '2048');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();

    expect(getSandboxRuntimeProfile('opensandbox').buildConfig()).toMatchObject({
      resourceRequests: { cpuCount: 0.333, memoryMiB: 682 }
    });
  });

  it('clamps derived requests to the 1m cpu and 1MiB memory floors', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '0.005');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '5');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();

    expect(getSandboxRuntimeProfile('opensandbox').buildConfig()).toMatchObject({
      resourceRequests: { cpuCount: 0.001, memoryMiB: 1 }
    });
  });

  it('never derives disk requests from storageSize', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '10');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '1');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '2048');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();
    const result = getSandboxRuntimeProfile('opensandbox').buildConfig({
      createConfig: { resourceLimits: { storageSize: '5G' } }
    });

    expect(result).toMatchObject({
      resourceLimits: { storageSize: '5G' },
      resourceRequests: { cpuCount: 0.1, memoryMiB: 204 }
    });
    expect(result?.resourceRequests).not.toHaveProperty('storageSize');
  });

  it('derives cpu-only overcommit while mirroring memory limits', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '5');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '1');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '2');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '4096');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();

    expect(getSandboxRuntimeProfile('opensandbox').buildConfig()).toMatchObject({
      resourceRequests: { cpuCount: 0.4, memoryMiB: 4096 }
    });
  });

  it('derives memory-only overcommit while mirroring cpu limits', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'runtime/fastgpt:stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'kubernetes');
    vi.stubEnv('AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', '1');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR', '2');
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '2');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '4096');

    const { getSandboxRuntimeProfile } = await loadSandboxRuntimeProfileModule();

    expect(getSandboxRuntimeProfile('opensandbox').buildConfig()).toMatchObject({
      resourceRequests: { cpuCount: 2, memoryMiB: 2048 }
    });
  });
});
