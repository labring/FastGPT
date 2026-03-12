import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildSandboxAdapter,
  connectToProviderSandbox,
  disconnectFromProviderSandbox,
  getProviderSandboxEndpoint,
  getSandboxProviderConfig,
  validateSandboxConfig
} from '@fastgpt/service/core/agentSkills/sandboxConfig';

const envBackup = { ...process.env };

describe('sandboxConfig provider helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('parses sealosdevbox config from env', () => {
    process.env.SANDBOX_PROVIDER_NAME = 'sealosdevbox';
    process.env.SANDBOX_PROVIDER_BASE_URL = 'https://devbox.example.com';
    process.env.SANDBOX_PROVIDER_TOKEN = 'sealos-token';
    process.env.SANDBOX_PROVIDER_RUNTIME = 'docker';

    const config = getSandboxProviderConfig();

    expect(config).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token',
      runtime: 'docker'
    });
  });

  it('builds opensandbox adapter through createSandbox factory', () => {
    const result = buildSandboxAdapter(
      {
        provider: 'opensandbox',
        baseUrl: 'http://sandbox.local',
        apiKey: 'api-key',
        runtime: 'kubernetes'
      },
      {
        createConfig: {
          image: {
            repository: 'fastgpt-agent-sandbox',
            tag: 'latest'
          }
        }
      }
    );

    expect(result.provider).toBe('opensandbox');
    expect((result as any).connectionConfig).toEqual({
      apiKey: 'api-key',
      baseUrl: 'http://sandbox.local',
      runtime: 'kubernetes'
    });
    expect((result as any).createConfig).toEqual({
      image: {
        repository: 'fastgpt-agent-sandbox',
        tag: 'latest'
      }
    });
  });

  it('rejects unsupported managed create config for sealosdevbox', () => {
    expect(() =>
      buildSandboxAdapter(
        {
          provider: 'sealosdevbox',
          baseUrl: 'https://devbox.example.com',
          token: 'sealos-token',
          runtime: 'docker'
        },
        {
          providerSandboxId: 'devbox-1',
          createConfig: {
            image: {
              repository: 'fastgpt-agent-sandbox',
              tag: 'latest'
            }
          }
        }
      )
    ).toThrow('does not support custom image/entrypoint/env/metadata');
  });

  it('connects opensandbox via provider-specific connect hook', async () => {
    const connectMock = vi
      .spyOn(
        Object.getPrototypeOf(
          buildSandboxAdapter({
            provider: 'opensandbox',
            baseUrl: 'http://sandbox.local',
            apiKey: 'api-key',
            runtime: 'docker'
          })
        ),
        'connect'
      )
      .mockResolvedValue(undefined);

    const result = await connectToProviderSandbox(
      {
        provider: 'opensandbox',
        baseUrl: 'http://sandbox.local',
        apiKey: 'api-key',
        runtime: 'docker'
      },
      'sandbox-1'
    );

    expect(result.provider).toBe('opensandbox');
    expect(connectMock).toHaveBeenCalledWith('sandbox-1');
  });

  it('disconnects opensandbox and keeps other providers as no-op', async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    await disconnectFromProviderSandbox({
      provider: 'opensandbox',
      close: closeMock
    } as any);
    expect(closeMock).toHaveBeenCalledTimes(1);

    await expect(
      disconnectFromProviderSandbox({
        provider: 'sealosdevbox'
      } as any)
    ).resolves.toBeUndefined();
  });

  it('throws when endpoint capability is unavailable on current provider', async () => {
    await expect(
      getProviderSandboxEndpoint(
        {
          provider: 'sealosdevbox'
        } as any,
        8080
      )
    ).rejects.toThrow('does not expose endpoint capability');
  });

  it('validates sealosdevbox token requirement', () => {
    expect(() =>
      validateSandboxConfig({
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: '',
        runtime: 'docker'
      })
    ).toThrow('Sandbox provider token is required for sealosdevbox');
  });
});
