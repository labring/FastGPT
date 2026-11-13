import { afterEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
  buildBaseSandboxRuntimeEnv,
  buildOpenSandboxCreateConfig,
  getDefaultOpenSandboxEphemeralStorageSize,
  getSandboxRuntimeProfile
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox';

const originalEnv = {
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
  AGENT_SANDBOX_STORAGE_SIZE_GI: serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI,
  AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR: serviceEnv.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR,
  AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR: serviceEnv.AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR
};

describe('sandbox runtime profile', () => {
  afterEach(() => Object.assign(serviceEnv, originalEnv));

  it('uses fixed /workspace and /home/sandbox and preserves the full image URI string', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE =
      'registry.local:5000/runtime-image:stable@sha256:abc';

    const runtimeProfile = getSandboxRuntimeProfile();

    expect(runtimeProfile).toEqual({
      defaultImage: 'registry.local:5000/runtime-image:stable@sha256:abc',
      workDirectory: '/workspace',
      homeDirectory: '/home/sandbox'
    });
  });

  it('preserves an explicit opensandbox ready timeout', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'runtime/fastgpt:stable';

    expect(
      buildOpenSandboxCreateConfig({
        createConfig: { readyTimeoutSeconds: 45 }
      })
    ).toMatchObject({ readyTimeoutSeconds: 45 });
    expect(buildOpenSandboxCreateConfig()).toMatchObject({ readyTimeoutSeconds: 120 });
  });

  it('sets ephemeralStorageSize from AGENT_SANDBOX_STORAGE_SIZE_GI + 0.5 for kubernetes runtime and preserves it across overcommit requests', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'kubernetes';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'runtime/fastgpt:stable';
    serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI = 2;
    serviceEnv.AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR = 2;
    serviceEnv.AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR = 2;

    const config = buildOpenSandboxCreateConfig({
      resourceLimits: { cpuCount: 2, memoryMiB: 2048 }
    });

    expect(config.resourceLimits).toEqual({
      cpuCount: 2,
      memoryMiB: 2048,
      ephemeralStorageSize: '2.5Gi'
    });
    expect(config.resourceRequests).toEqual({
      cpuCount: 1,
      memoryMiB: 1024,
      ephemeralStorageSize: '2.5Gi'
    });
    expect(getDefaultOpenSandboxEphemeralStorageSize({ workspaceMultiplier: 2 })).toBe('4.5Gi');
  });

  it('injects HOME and workspace-persisted user-space prefixes without overwriting PATH', () => {
    expect(
      buildBaseSandboxRuntimeEnv({
        sessionId: 'session-1',
        workDirectory: '/workspace',
        image: 'fastgpt-agent-sandbox:v2'
      })
    ).toEqual({
      HOME: '/home/sandbox',
      FASTGPT_SESSION_ID: 'session-1',
      FASTGPT_WORKDIR: '/workspace',
      PYTHONUSERBASE: '/workspace/.fastgpt/python',
      PIP_BREAK_SYSTEM_PACKAGES: '1',
      NPM_CONFIG_PREFIX: '/workspace/.fastgpt/npm',
      BUN_INSTALL: '/workspace/.fastgpt/bun',
      BUN_INSTALL_CACHE_DIR: '/tmp/.bun-cache',
      FASTGPT_RUNTIME_IMAGE: 'fastgpt-agent-sandbox:v2'
    });
  });
});
