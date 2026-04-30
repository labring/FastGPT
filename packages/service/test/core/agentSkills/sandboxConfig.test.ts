import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envBackup = { ...process.env };

const loadSandboxConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/agentSkills/sandboxConfig');
};

describe('sandboxConfig provider helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('parses sealosdevbox config from env', async () => {
    process.env.AGENT_SANDBOX_PROVIDER = 'sealosdevbox';
    process.env.AGENT_SANDBOX_SEALOS_BASEURL = 'https://devbox.example.com';
    process.env.AGENT_SANDBOX_SEALOS_TOKEN = 'sealos-token';
    process.env.AGENT_SANDBOX_RUNTIME = 'docker';

    const { getSandboxProviderConfig } = await loadSandboxConfigModule();

    const config = getSandboxProviderConfig();

    expect(config).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token',
      runtime: 'docker'
    });
  });

  it('builds opensandbox adapter through createSandbox factory', async () => {
    const { buildSandboxAdapter } = await loadSandboxConfigModule();

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
        },
        providerSandboxId: ''
      }
    );

    expect(result.provider).toBe('opensandbox');
    expect((result as any).connectionConfig).toEqual({
      apiKey: 'api-key',
      baseUrl: 'http://sandbox.local',
      runtime: 'kubernetes',
      useServerProxy: undefined,
      sessionId: ''
    });
    expect((result as any).createConfig).toEqual({
      image: {
        repository: 'fastgpt-agent-sandbox',
        tag: 'latest'
      }
    });
  });

  it('rejects unsupported managed create config for sealosdevbox', async () => {
    const { buildSandboxAdapter } = await loadSandboxConfigModule();

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
    const { buildSandboxAdapter, connectToProviderSandbox } = await loadSandboxConfigModule();

    const connectMock = vi
      .spyOn(
        Object.getPrototypeOf(
          buildSandboxAdapter(
            {
              provider: 'opensandbox',
              baseUrl: 'http://sandbox.local',
              apiKey: 'api-key',
              runtime: 'docker'
            },
            {
              providerSandboxId: 'sandbox-1',
              createConfig: {
                image: {
                  repository: 'fastgpt-agent-sandbox',
                  tag: 'latest'
                }
              }
            }
          )
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
    const { disconnectFromProviderSandbox } = await loadSandboxConfigModule();

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
    const { getProviderSandboxEndpoint } = await loadSandboxConfigModule();

    await expect(
      getProviderSandboxEndpoint(
        {
          provider: 'sealosdevbox'
        } as any,
        8080
      )
    ).rejects.toThrow('does not expose endpoint capability');
  });

  it('validates sealosdevbox token requirement', async () => {
    const { validateSandboxConfig } = await loadSandboxConfigModule();

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
