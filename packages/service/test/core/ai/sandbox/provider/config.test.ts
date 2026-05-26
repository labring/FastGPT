import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: process.env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY,
  AGENT_SANDBOX_E2B_API_KEY: process.env.AGENT_SANDBOX_E2B_API_KEY,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
};

const loadSandboxConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/provider/config');
};

const defaultOpenSandboxDockerNetworkPolicy = {
  defaultAction: 'allow',
  egress: [
    { action: 'deny', target: 'localhost' },
    { action: 'deny', target: 'host.docker.internal' },
    { action: 'deny', target: 'host.orb.internal' },
    { action: 'deny', target: 'docker.orb.internal' },
    { action: 'deny', target: 'gateway.orb.internal' },
    { action: 'deny', target: 'proxyproxy.orb.internal' },
    { action: 'deny', target: '*.orb.internal' },
    { action: 'deny', target: '*.orb.local' }
  ]
};

describe('sandbox provider config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', originalEnv.AGENT_SANDBOX_SEALOS_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', originalEnv.AGENT_SANDBOX_SEALOS_TOKEN);
    vi.stubEnv(
      'AGENT_SANDBOX_SEALOS_WORK_DIRECTORY',
      originalEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY
    );
    vi.stubEnv('AGENT_SANDBOX_E2B_API_KEY', originalEnv.AGENT_SANDBOX_E2B_API_KEY);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', originalEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', originalEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', originalEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME);
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO
    );
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
    );
    vi.unstubAllGlobals();
  });

  it('parses sealosdevbox config from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'sealos-token');

    const { getSandboxProviderConfig } = await loadSandboxConfigModule();

    expect(getSandboxProviderConfig()).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token'
    });
  });

  it('parses e2b config from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'e2b');
    vi.stubEnv('AGENT_SANDBOX_E2B_API_KEY', 'e2b-token');

    const { getSandboxProviderConfig } = await loadSandboxConfigModule();

    expect(getSandboxProviderConfig()).toEqual({
      provider: 'e2b',
      apiKey: 'e2b-token'
    });
  });

  it('keeps e2b runtime create config when runtime adapter config is requested', async () => {
    vi.stubEnv('AGENT_SANDBOX_E2B_API_KEY', 'e2b-token');

    const { getSandboxAdapterConfig } = await loadSandboxConfigModule();

    expect(
      getSandboxAdapterConfig({
        provider: 'e2b',
        runtime: true,
        createConfig: {
          env: { A: 'B' }
        }
      })
    ).toEqual({
      providerConfig: {
        provider: 'e2b',
        apiKey: 'e2b-token'
      },
      createConfig: {
        env: { A: 'B' }
      }
    });
  });

  it('builds sealosdevbox runtime create config from runtime profile', async () => {
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'https://devbox.example.com');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'sealos-token');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_WORK_DIRECTORY', '/home/devbox/workspace');

    const { getSandboxAdapterConfig } = await loadSandboxConfigModule();

    expect(
      getSandboxAdapterConfig({
        provider: 'sealosdevbox',
        runtime: true,
        sessionId: 'session-1'
      })
    ).toEqual({
      providerConfig: {
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: 'sealos-token'
      },
      createConfig: {
        workingDir: '/home/devbox/workspace',
        upstreamID: 'session-1'
      }
    });
  });

  it('normalizes missing provider env values before validation', async () => {
    vi.resetModules();
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
        AGENT_SANDBOX_SEALOS_BASEURL: undefined,
        AGENT_SANDBOX_SEALOS_TOKEN: undefined,
        AGENT_SANDBOX_E2B_API_KEY: undefined
      }
    }));

    try {
      const { getSandboxAdapterConfig } =
        await import('@fastgpt/service/core/ai/sandbox/provider/config');

      expect(() => getSandboxAdapterConfig({ provider: 'sealosdevbox' })).toThrow(
        'Sandbox provider base URL is required'
      );
      expect(() => getSandboxAdapterConfig({ provider: 'opensandbox' })).toThrow(
        'Sandbox provider base URL is required'
      );
      expect(() => getSandboxAdapterConfig({ provider: 'e2b' })).toThrow(
        'Sandbox provider apiKey is required for e2b'
      );
    } finally {
      vi.doUnmock('@fastgpt/service/env');
      vi.resetModules();
    }
  });

  it('parses opensandbox config and runtime create config from env', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'opensandbox-key');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'docker');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO', 'fastgpt-agent-sandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG', 'test');

    const { getSandboxAdapterConfig } = await loadSandboxConfigModule();

    expect(
      getSandboxAdapterConfig({
        runtime: true,
        resourceLimits: {
          cpuCount: 1,
          memoryMiB: 512
        },
        vmConfig: {
          volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
          storage: { mountPath: '/workspace' }
        },
        createConfig: {
          image: { repository: 'custom-image', tag: 'custom' },
          entrypoint: ['sh', '-c', 'echo ok'],
          env: { A: 'B' },
          metadata: { teamId: 'team-1' },
          networkPolicy: {
            defaultAction: 'allow',
            egress: [{ action: 'deny', target: 'host.docker.internal' }]
          },
          extensions: {
            traceId: 'trace-1'
          }
        }
      })
    ).toEqual({
      providerConfig: {
        provider: 'opensandbox',
        baseUrl: 'http://opensandbox.local',
        apiKey: 'opensandbox-key',
        runtime: 'docker',
        useServerProxy: true
      },
      createConfig: {
        image: { repository: 'custom-image', tag: 'custom' },
        resourceLimits: {
          cpuCount: 1,
          memoryMiB: 512
        },
        entrypoint: ['sh', '-c', 'echo ok'],
        env: { A: 'B' },
        metadata: { teamId: 'team-1' },
        networkPolicy: {
          defaultAction: 'allow',
          egress: [{ action: 'deny', target: 'host.docker.internal' }]
        },
        extensions: {
          traceId: 'trace-1'
        },
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }]
      }
    });
  });

  it('builds opensandbox runtime create config from profile env image', async () => {
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_RUNTIME', 'docker');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO', 'default-opensandbox-image');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG', 'stable');

    vi.resetModules();
    const { getSandboxRuntimeProfile } =
      await import('@fastgpt/service/core/ai/sandbox/runtime/profile');

    expect(getSandboxRuntimeProfile('opensandbox').buildConfig()).toEqual({
      image: {
        repository: 'default-opensandbox-image',
        tag: 'stable'
      },
      networkPolicy: defaultOpenSandboxDockerNetworkPolicy
    });
  });

  it('validates sealosdevbox token requirement', async () => {
    const { validateSandboxConfig } = await loadSandboxConfigModule();

    expect(() =>
      validateSandboxConfig({
        provider: 'sealosdevbox',
        baseUrl: 'https://devbox.example.com',
        token: ''
      })
    ).toThrow('Sandbox provider token is required for sealosdevbox');
  });

  it('validates e2b api key requirement', async () => {
    const { validateSandboxConfig } = await loadSandboxConfigModule();

    expect(() =>
      validateSandboxConfig({
        provider: 'e2b',
        apiKey: ''
      })
    ).toThrow('Sandbox provider apiKey is required for e2b');
  });

  it('validates base url, api key and opensandbox runtime requirements', async () => {
    const { validateSandboxConfig } = await loadSandboxConfigModule();

    expect(() =>
      validateSandboxConfig({
        provider: 'opensandbox',
        baseUrl: '',
        apiKey: 'opensandbox-key',
        runtime: 'docker'
      })
    ).toThrow('Sandbox provider base URL is required');

    expect(() =>
      validateSandboxConfig({
        provider: 'opensandbox',
        baseUrl: 'http://opensandbox.local',
        apiKey: '',
        runtime: 'docker'
      })
    ).toThrow('Sandbox provider apiKey is required for opensandbox');

    expect(() =>
      validateSandboxConfig({
        provider: 'opensandbox',
        baseUrl: 'http://opensandbox.local',
        apiKey: 'opensandbox-key',
        runtime: 'invalid' as 'docker'
      })
    ).toThrow('Invalid runtime: invalid');
  });

  it('requires opensandbox api key for docker runtime', async () => {
    const { validateSandboxConfig } = await loadSandboxConfigModule();

    expect(() =>
      validateSandboxConfig({
        provider: 'opensandbox',
        baseUrl: 'http://opensandbox.local',
        apiKey: '',
        runtime: 'docker'
      })
    ).toThrow('Sandbox provider apiKey is required for opensandbox');
  });

  it('throws for unsupported provider in config switch', async () => {
    const { getSandboxAdapterConfig } = await loadSandboxConfigModule();

    expect(() =>
      getSandboxAdapterConfig({
        provider: 'unknown-provider' as any
      })
    ).toThrow('Unsupported sandbox provider: unknown-provider');
  });

  it('requires opensandbox default image when no explicit image is provided', async () => {
    vi.resetModules();
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_PROVIDER: 'opensandbox',
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
        AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
        AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: '',
        AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: undefined,
        AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: true
      }
    }));

    try {
      const { getSandboxRuntimeProfile } =
        await import('@fastgpt/service/core/ai/sandbox/runtime/profile');
      const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

      expect(() => runtimeProfile.buildConfig()).toThrow(
        'AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO is required'
      );
      expect(
        runtimeProfile.buildConfig({
          createConfig: {
            image: { repository: 'explicit-image' }
          }
        })?.image
      ).toEqual({ repository: 'explicit-image' });
    } finally {
      vi.doUnmock('@fastgpt/service/env');
      vi.resetModules();
    }
  });
});
