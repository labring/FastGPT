import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://mock-opensandbox.local',
    AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'mock-opensandbox-api-key',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: false,
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'runtime-image',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: 'test',
    AGENT_SANDBOX_SEALOS_BASEURL: 'http://mock-sealos.local',
    AGENT_SANDBOX_SEALOS_TOKEN: 'mock-sealos-token',
    AGENT_SANDBOX_E2B_API_KEY: 'mock-e2b-token',
    SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST: false
  }
}));

const mocks = vi.hoisted(() => ({
  createSandbox: vi.fn((provider: string, connectionConfig: unknown, createConfig?: unknown) => ({
    provider,
    connectionConfig,
    createConfig
  }))
}));

vi.mock('@fastgpt-sdk/sandbox-adapter', () => ({
  OPEN_SANDBOX_DEFAULT_ROOT_PATH: '/workspace',
  createSandbox: mocks.createSandbox
}));

import {
  buildRuntimeSandboxAdapter,
  buildSandboxAdapter,
  buildSandboxResourceAdapter
} from '@fastgpt/service/core/ai/sandbox/provider/adapter';

describe('sandbox provider adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds e2b sandbox adapter through the shared factory', () => {
    const result = buildSandboxAdapter(
      {
        provider: 'e2b',
        apiKey: 'e2b-token'
      },
      {
        sandboxId: 'e2b-sandbox-1'
      }
    );

    expect(result.provider).toBe('e2b');
    expect(mocks.createSandbox).toHaveBeenCalledWith('e2b', {
      apiKey: 'e2b-token',
      sandboxId: 'e2b-sandbox-1'
    });
  });

  it('throws when e2b adapter is missing api key', () => {
    expect(() =>
      buildSandboxAdapter(
        {
          provider: 'e2b',
          apiKey: ''
        },
        {
          sandboxId: 'e2b-sandbox-1'
        }
      )
    ).toThrow('AGENT_SANDBOX_E2B_API_KEY required');
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
    ).toThrow('Unsupported sandbox provider: [object Object]');
  });

  it('builds opensandbox adapter with session id and create config', () => {
    const result = buildSandboxAdapter(
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

    expect(result.provider).toBe('opensandbox');
    expect(mocks.createSandbox).toHaveBeenCalledWith(
      'opensandbox',
      expect.objectContaining({
        baseUrl: 'http://opensandbox.local',
        apiKey: 'api-key',
        runtime: 'docker',
        sessionId: 'opensandbox-session-1',
        useServerProxy: true
      }),
      {
        image: { repository: 'runtime-image', tag: 'test' }
      }
    );
  });

  it('builds sealos sandbox adapter through the shared factory', () => {
    const result = buildSandboxAdapter(
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

    expect(result.provider).toBe('sealosdevbox');
    expect(mocks.createSandbox).toHaveBeenCalledWith(
      'sealosdevbox',
      {
        baseUrl: 'http://sealos.local',
        token: 'token',
        sandboxId: 'sealos-sandbox-1'
      },
      { env: { A: 'B' } }
    );
  });

  it('builds runtime adapter with runtime create config', () => {
    const result = buildRuntimeSandboxAdapter('opensandbox', 'runtime-session-1', {
      resourceLimits: { cpuCount: 1, memoryMiB: 512 },
      vmConfig: {
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
        storage: { mountPath: '/workspace' }
      },
      createConfig: {
        image: { repository: 'custom-runtime', tag: 'test' }
      }
    });

    expect(result.provider).toBe('opensandbox');
    expect(mocks.createSandbox).toHaveBeenCalledWith(
      'opensandbox',
      expect.objectContaining({
        sessionId: 'runtime-session-1'
      }),
      expect.objectContaining({
        image: { repository: 'custom-runtime', tag: 'test' },
        resourceLimits: { cpuCount: 1, memoryMiB: 512 },
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }]
      })
    );
  });

  it('builds resource adapter without runtime create config', () => {
    const result = buildSandboxResourceAdapter({
      provider: 'opensandbox',
      sandboxId: 'resource-session-1'
    });

    expect(result.provider).toBe('opensandbox');
    expect(mocks.createSandbox).toHaveBeenCalledWith(
      'opensandbox',
      expect.objectContaining({
        sessionId: 'resource-session-1'
      }),
      undefined
    );
  });
});
