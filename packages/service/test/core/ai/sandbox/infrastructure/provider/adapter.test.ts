import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultInstanceConfig } from '@test/utils/instanceConfigSnapshot';

const mocks = vi.hoisted(() => ({
  createSandbox: vi.fn(
    (config: { provider: string; connectionConfig: unknown; createConfig?: unknown }) => ({
      ...config,
      close: vi.fn(async () => undefined)
    })
  )
}));

vi.mock('@fastgpt-sdk/sandbox-adapter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt-sdk/sandbox-adapter')>()),
  OPEN_SANDBOX_DEFAULT_ROOT_PATH: '/workspace',
  createSandbox: mocks.createSandbox
}));

import {
  buildRuntimeSandboxAdapter,
  buildSandboxAdapter,
  buildSandboxResourceAdapter
} from '@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter';

describe('sandbox provider adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.systemInstanceConfig = createDefaultInstanceConfig();
    const sandbox = global.systemInstanceConfig.subservice.agentSandbox;
    sandbox.provider = 'opensandbox';
    Object.assign(sandbox.opensandbox, {
      baseUrl: 'http://mock-opensandbox.local',
      apiKey: 'mock-opensandbox-api-key',
      runtime: 'docker',
      useServerProxy: false,
      image: 'runtime-image:test'
    });
    Object.assign(sandbox.sealosdevbox, {
      baseUrl: 'http://mock-sealos.local',
      token: 'mock-sealos-token'
    });
  });

  it('throws when adapter factory receives an unsupported provider', () => {
    expect(() =>
      buildSandboxAdapter(
        {
          provider: 'unknown-provider'
        } as any,
        {
          sandboxId: 'unknown-sandbox'
        }
      )
    ).toThrow('Unsupported sandbox provider');
  });

  it('requires an image when opensandbox create config is present', () => {
    expect(() =>
      buildSandboxAdapter(
        {
          provider: 'opensandbox',
          baseUrl: 'http://opensandbox.local',
          apiKey: 'api-key',
          runtime: 'docker'
        },
        {
          sandboxId: 'opensandbox-session-1',
          createConfig: { env: { A: 'B' } }
        }
      )
    ).toThrow('OpenSandbox create config requires an image');
  });

  it('builds opensandbox adapter with session id and create config', () => {
    buildSandboxAdapter(
      {
        provider: 'opensandbox',
        baseUrl: 'http://opensandbox.local',
        apiKey: 'api-key',
        runtime: 'docker',
        useServerProxy: true
      },
      {
        sandboxId: 'opensandbox-session-1',
        createConfig: {
          image: { repository: 'runtime-image', tag: 'test' }
        }
      }
    );

    expect(mocks.createSandbox).toHaveBeenCalledWith({
      provider: 'opensandbox',
      connectionConfig: expect.objectContaining({
        baseUrl: 'http://opensandbox.local',
        apiKey: 'api-key',
        runtime: 'docker',
        sessionId: 'opensandbox-session-1',
        useServerProxy: true
      }),
      createConfig: expect.objectContaining({
        image: { repository: 'runtime-image', tag: 'test' }
      })
    });
  });

  it('builds sealos sandbox adapter through the shared factory', () => {
    buildSandboxAdapter(
      {
        provider: 'sealosdevbox',
        baseUrl: 'http://sealos.local',
        token: 'token'
      },
      {
        sandboxId: 'sealos-sandbox-1',
        createConfig: { env: { A: 'B' } }
      }
    );

    expect(mocks.createSandbox).toHaveBeenCalledWith({
      provider: 'sealosdevbox',
      connectionConfig: {
        baseUrl: 'http://sealos.local',
        token: 'token',
        sandboxId: 'sealos-sandbox-1'
      },
      createConfig: expect.objectContaining({ env: { A: 'B' } })
    });
  });

  it('builds runtime adapter with runtime create config', () => {
    buildRuntimeSandboxAdapter('opensandbox', 'runtime-session-1', {
      resourceLimits: { cpuCount: 1, memoryMiB: 512 },
      vmConfig: {
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
        storage: { mountPath: '/workspace' }
      },
      createConfig: {
        image: { repository: 'custom-runtime', tag: 'test' }
      }
    });

    expect(mocks.createSandbox).toHaveBeenCalledWith({
      provider: 'opensandbox',
      connectionConfig: expect.objectContaining({
        sessionId: 'runtime-session-1'
      }),
      createConfig: expect.objectContaining({
        image: { repository: 'custom-runtime', tag: 'test' },
        resourceLimits: { cpuCount: 1, memoryMiB: 512 },
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }]
      })
    });
  });

  it('builds resource adapter without runtime create config', () => {
    buildSandboxResourceAdapter({
      provider: 'opensandbox',
      sandboxId: 'resource-session-1'
    });

    expect(mocks.createSandbox).toHaveBeenCalledWith({
      provider: 'opensandbox',
      connectionConfig: expect.objectContaining({
        sessionId: 'resource-session-1'
      }),
      createConfig: undefined
    });
  });
});
