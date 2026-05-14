import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME
};

const loadSandboxProviderModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/provider');
};

const loadSkillSandboxConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/agentSkills/sandboxConfig');
};

describe('sandbox provider helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', originalEnv.AGENT_SANDBOX_SEALOS_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', originalEnv.AGENT_SANDBOX_SEALOS_TOKEN);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', originalEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME);
  });

  it('parses sealosdevbox config from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'sealos-token');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'docker');

    const { getSandboxProviderConfig } = await loadSandboxProviderModule();

    const config = getSandboxProviderConfig();

    expect(config).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token',
      runtime: 'docker'
    });
  });

  it('builds opensandbox adapter through createSandbox factory', async () => {
    const { buildSandboxAdapter } = await loadSandboxProviderModule();

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
      replaceDockerInternalWithLocalhost: false,
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

  it('passes managed create config through for sealosdevbox', async () => {
    const { buildSandboxAdapter } = await loadSandboxProviderModule();

    const result = buildSandboxAdapter(
      {
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: 'sealos-token',
        runtime: 'docker'
      },
      {
        providerSandboxId: 'devbox-1',
        createConfig: {
          env: {
            CODE_SERVER_ENABLED: 'true'
          },
          workingDir: '/home/devbox/workspace'
        }
      }
    );

    expect(result.provider).toBe('sealosdevbox');
  });

  it('builds session-runtime create config for sealosdevbox without default image or entrypoint', async () => {
    const { buildSessionRuntimeCreateConfig } = await loadSkillSandboxConfigModule();

    const result = buildSessionRuntimeCreateConfig({
      providerConfig: {
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: 'sealos-token',
        runtime: 'docker'
      },
      sessionId: 'session-1',
      defaults: {
        defaultImage: { repository: '' },
        workDirectory: '/home/devbox/workspace',
        entrypoint: ''
      },
      teamId: 'team-1',
      tmbId: 'member-1',
      skillIds: ['skill-1', 'skill-2']
    });

    expect(result).toEqual({
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/home/devbox/workspace',
        FASTGPT_ENABLE_CODE_SERVER: 'false'
      },
      workingDir: '/home/devbox/workspace',
      metadata: {
        teamId: 'team-1',
        tmbId: 'member-1',
        sandboxType: 'session-runtime',
        skillIds: 'skill-1-skill-2',
        sessionId: 'session-1'
      }
    });
  });

  it('keeps explicit image override in session-runtime create config for sealosdevbox', async () => {
    const { buildSessionRuntimeCreateConfig } = await loadSkillSandboxConfigModule();

    const result = buildSessionRuntimeCreateConfig({
      providerConfig: {
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: 'sealos-token',
        runtime: 'docker'
      },
      sessionId: 'session-1',
      defaults: {
        defaultImage: { repository: '' },
        workDirectory: '/home/devbox/workspace',
        entrypoint: ''
      },
      image: { repository: 'custom-devbox-runtime', tag: 'test' },
      teamId: 'team-1',
      tmbId: 'member-1',
      skillIds: []
    });

    expect(result.image).toEqual({ repository: 'custom-devbox-runtime', tag: 'test' });
    expect(result.entrypoint).toBeUndefined();
  });

  it('connects opensandbox via provider-specific connect hook', async () => {
    const { buildSandboxAdapter, connectToProviderSandbox } = await loadSandboxProviderModule();

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
    const { disconnectFromProviderSandbox } = await loadSandboxProviderModule();

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
    const { getProviderSandboxEndpoint } = await loadSandboxProviderModule();

    await expect(
      getProviderSandboxEndpoint({
        provider: 'sealosdevbox'
      } as any)
    ).rejects.toThrow('does not expose endpoint capability');
  });

  it('validates sealosdevbox token requirement', async () => {
    const { validateSandboxConfig } = await loadSandboxProviderModule();

    expect(() =>
      validateSandboxConfig({
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: '',
        runtime: 'docker'
      })
    ).toThrow('Sandbox provider token is required for sealosdevbox');
  });

  it('builds edit-debug sandbox id from skill id and edit-debug chat id only', async () => {
    const { EDIT_DEBUG_SANDBOX_CHAT_ID, getEditDebugSandboxId } =
      await loadSkillSandboxConfigModule();

    expect(EDIT_DEBUG_SANDBOX_CHAT_ID).toBe('edit-debug');
    expect(getEditDebugSandboxId('skill-1')).toBe(getEditDebugSandboxId('skill-1'));
    expect(getEditDebugSandboxId('skill-1')).not.toBe(getEditDebugSandboxId('skill-2'));
  });

  it('requires providerSandboxId when connecting to opensandbox instance', async () => {
    const { getProviderSandboxConnectionTarget } = await loadSandboxProviderModule();

    expect(() =>
      getProviderSandboxConnectionTarget(
        {
          provider: 'opensandbox',
          baseUrl: 'http://sandbox.local',
          runtime: 'docker'
        },
        {
          sandboxId: 'stable-session-id'
        }
      )
    ).toThrow('Sandbox providerSandboxId missing');
  });

  it('uses providerSandboxId when connecting to opensandbox instance', async () => {
    const { getProviderSandboxConnectionTarget } = await loadSandboxProviderModule();

    const target = getProviderSandboxConnectionTarget(
      {
        provider: 'opensandbox',
        baseUrl: 'http://sandbox.local',
        runtime: 'docker'
      },
      {
        sandboxId: 'stable-session-id',
        metadata: {
          providerSandboxId: 'provider-sandbox-id'
        }
      }
    );

    expect(target).toBe('provider-sandbox-id');
  });
});
