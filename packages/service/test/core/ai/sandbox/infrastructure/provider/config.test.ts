import {
  getTestInstanceConfig,
  createDefaultInstanceConfig
} from '@test/utils/instanceConfigSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
  AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: process.env.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY,
  AGENT_SANDBOX_SEALOS_IMAGE: process.env.AGENT_SANDBOX_SEALOS_IMAGE,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: process.env.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
  AGENT_SANDBOX_CPU_COUNT: process.env.AGENT_SANDBOX_CPU_COUNT,
  AGENT_SANDBOX_MEMORY_MIB: process.env.AGENT_SANDBOX_MEMORY_MIB,
  AGENT_SANDBOX_STORAGE_SIZE_GI: process.env.AGENT_SANDBOX_STORAGE_SIZE_GI,
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL:
    process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL,
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN:
    process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN,
  AGENT_SANDBOX_PROXY_SECRET: process.env.AGENT_SANDBOX_PROXY_SECRET,
  AGENT_SANDBOX_PROXY_URL: process.env.AGENT_SANDBOX_PROXY_URL,
  AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES: process.env.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES,
  AGENT_SANDBOX_WS_MAX_FRAME_BYTES: process.env.AGENT_SANDBOX_WS_MAX_FRAME_BYTES
};

const loadSandboxConfigModule = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config');
};

const defaultOpenSandboxNetworkPolicy = {
  defaultAction: 'allow',
  egress: [
    { action: 'deny', target: 'localhost' },
    { action: 'deny', target: '127.0.0.0/8' },
    { action: 'deny', target: '::1/128' },
    { action: 'deny', target: '10.0.0.0/8' },
    { action: 'deny', target: '100.64.0.0/10' },
    { action: 'deny', target: '169.254.0.0/16' },
    { action: 'deny', target: '172.16.0.0/12' },
    { action: 'deny', target: '192.168.0.0/16' },
    { action: 'deny', target: '224.0.0.0/4' },
    { action: 'deny', target: 'fc00::/7' },
    { action: 'deny', target: 'fe80::/10' },
    { action: 'deny', target: '*.local' },
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
    global.systemInstanceConfig = createDefaultInstanceConfig();
    vi.clearAllMocks();
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', 'test-secret-123456789012345678901234');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'ws://localhost:1006');
  });

  afterEach(() => {
    getTestInstanceConfig().subservice.agentSandbox.provider =
      originalEnv.AGENT_SANDBOX_PROVIDER ??
      createDefaultInstanceConfig().subservice.agentSandbox.provider;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.baseUrl =
      originalEnv.AGENT_SANDBOX_SEALOS_BASEURL ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.baseUrl;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.token =
      originalEnv.AGENT_SANDBOX_SEALOS_TOKEN ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.token;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.workDirectory =
      originalEnv.AGENT_SANDBOX_SEALOS_WORK_DIRECTORY ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.workDirectory;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.image =
      originalEnv.AGENT_SANDBOX_SEALOS_IMAGE ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.image;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl =
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.apiKey =
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.apiKey;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime =
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.runtime;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.image =
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.image;
    getTestInstanceConfig().subservice.agentSandbox.common.cpuCount =
      originalEnv.AGENT_SANDBOX_CPU_COUNT === undefined
        ? createDefaultInstanceConfig().subservice.agentSandbox.common.cpuCount
        : Number(originalEnv.AGENT_SANDBOX_CPU_COUNT);
    getTestInstanceConfig().subservice.agentSandbox.common.memoryMiB =
      originalEnv.AGENT_SANDBOX_MEMORY_MIB === undefined
        ? createDefaultInstanceConfig().subservice.agentSandbox.common.memoryMiB
        : Number(originalEnv.AGENT_SANDBOX_MEMORY_MIB);
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi =
      originalEnv.AGENT_SANDBOX_STORAGE_SIZE_GI === undefined
        ? createDefaultInstanceConfig().subservice.agentSandbox.common.storageSizeGi
        : Number(originalEnv.AGENT_SANDBOX_STORAGE_SIZE_GI);
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerUrl =
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerUrl;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerToken =
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerToken;
    getTestInstanceConfig().subservice.agentSandbox.common.wsMaxMessageBytes =
      originalEnv.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES === undefined
        ? createDefaultInstanceConfig().subservice.agentSandbox.common.wsMaxMessageBytes
        : Number(originalEnv.AGENT_SANDBOX_WS_MAX_MESSAGE_BYTES);
    getTestInstanceConfig().subservice.agentSandbox.common.wsMaxFrameBytes =
      originalEnv.AGENT_SANDBOX_WS_MAX_FRAME_BYTES === undefined
        ? createDefaultInstanceConfig().subservice.agentSandbox.common.wsMaxFrameBytes
        : Number(originalEnv.AGENT_SANDBOX_WS_MAX_FRAME_BYTES);
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', originalEnv.AGENT_SANDBOX_PROXY_SECRET);
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', originalEnv.AGENT_SANDBOX_PROXY_URL);
    vi.unstubAllGlobals();
  });

  it('parses sealosdevbox config from env', async () => {
    getTestInstanceConfig().subservice.agentSandbox.provider =
      'sealosdevbox' ?? createDefaultInstanceConfig().subservice.agentSandbox.provider;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.baseUrl =
      'https://devbox.example.com' ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.baseUrl;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.token =
      'sealos-token' ?? createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.token;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.image =
      'default-sealos-image:latest' ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.image;

    const { getSandboxProviderConfig } = await loadSandboxConfigModule();

    expect(getSandboxProviderConfig()).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token'
    });
  });

  it('does not default sandbox provider when env is empty', async () => {
    getTestInstanceConfig().subservice.agentSandbox.provider =
      createDefaultInstanceConfig().subservice.agentSandbox.provider;

    const { getConfiguredSandboxProvider, getSandboxProviderConfig } =
      await loadSandboxConfigModule();

    expect(getConfiguredSandboxProvider).toThrow(
      'Configure the provider in Agent Sandbox admin settings before using it'
    );
    expect(getSandboxProviderConfig).toThrow(
      'Configure the provider in Agent Sandbox admin settings before using it'
    );
  });

  it('connects to the provider stored in instance config when env provider is removed', async () => {
    getTestInstanceConfig().subservice.agentSandbox.provider =
      createDefaultInstanceConfig().subservice.agentSandbox.provider;

    const { getSandboxProviderConfig } = await loadSandboxConfigModule();
    const snapshot = createDefaultInstanceConfig() as any;
    snapshot.subservice.agentSandbox.provider = 'opensandbox';
    snapshot.subservice.agentSandbox.opensandbox = {
      baseUrl: 'https://opensandbox.example.com',
      apiKey: 'opensandbox-key',
      runtime: 'docker',
      useServerProxy: true
    };
    (global as any).systemInstanceConfig = snapshot;

    expect(getSandboxProviderConfig()).toEqual({
      provider: 'opensandbox',
      baseUrl: 'https://opensandbox.example.com',
      apiKey: 'opensandbox-key',
      runtime: 'docker',
      useServerProxy: true
    });
  });

  it('builds sealosdevbox runtime create config from runtime profile', async () => {
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.baseUrl =
      'https://devbox.example.com' ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.baseUrl;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.token =
      'sealos-token' ?? createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.token;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.workDirectory =
      '/home/devbox/workspace' ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.workDirectory;
    getTestInstanceConfig().subservice.agentSandbox.sealosdevbox.image =
      'default-sealos-image:latest' ??
      createDefaultInstanceConfig().subservice.agentSandbox.sealosdevbox.image;
    getTestInstanceConfig().subservice.agentSandbox.common.cpuCount = 2;
    getTestInstanceConfig().subservice.agentSandbox.common.memoryMiB = 4096;
    getTestInstanceConfig().subservice.agentSandbox.common.storageSizeGi = 5;
    getTestInstanceConfig().subservice.agentSandbox.common.wsMaxMessageBytes = 67108864;
    getTestInstanceConfig().subservice.agentSandbox.common.wsMaxFrameBytes = 16777216;

    const { getSandboxAdapterConfig } = await loadSandboxConfigModule();

    const result = getSandboxAdapterConfig({
      provider: 'sealosdevbox',
      runtime: true,
      sessionId: 'session-1'
    });

    expect(result.providerConfig).toEqual({
      provider: 'sealosdevbox',
      baseUrl: 'https://devbox.example.com',
      token: 'sealos-token'
    });

    expect(result.createConfig).toEqual({
      image: {
        repository: 'default-sealos-image',
        tag: 'latest'
      },
      resourceLimits: { cpuCount: 2, memoryMiB: 4096, storageSize: '5Gi' },
      workingDir: '/home/devbox/workspace',
      upstreamID: 'session-1',
      env: {
        FASTGPT_SESSION_ID: 'session-1',
        FASTGPT_WORKDIR: '/home/devbox/workspace',
        IDE_AGENT_ENABLED: 'true',
        DEVBOX_SDK_MAX_FILE_SIZE: '2527068160',
        FASTGPT_IDE_MAX_FILE_BYTES: '2527068160',
        FASTGPT_IDE_WS_MAX_MESSAGE_BYTES: '67108864',
        FASTGPT_IDE_WS_MAX_FRAME_BYTES: '16777216'
      }
    });

    const resultWithExplicitImage = getSandboxAdapterConfig({
      provider: 'sealosdevbox',
      runtime: true,
      sessionId: 'session-1',
      createConfig: {
        image: { repository: 'explicit-sealos-image', tag: 'v1' }
      }
    });
    expect(resultWithExplicitImage.createConfig?.image).toEqual({
      repository: 'explicit-sealos-image',
      tag: 'v1'
    });
  });

  it('normalizes missing provider env values before validation', async () => {
    vi.resetModules();
    vi.doMock('@fastgpt/service/env', () => ({
      serviceEnv: {
        AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
        AGENT_SANDBOX_SEALOS_BASEURL: undefined,
        AGENT_SANDBOX_SEALOS_TOKEN: undefined,
        AGENT_SANDBOX_STORAGE_SIZE_GI: 1
      }
    }));

    try {
      const { getSandboxAdapterConfig } =
        await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/config');

      expect(() => getSandboxAdapterConfig({ provider: 'sealosdevbox' })).toThrow(
        'Sandbox provider base URL is required'
      );
      expect(() => getSandboxAdapterConfig({ provider: 'opensandbox' })).toThrow(
        'Sandbox provider base URL is required'
      );
    } finally {
      vi.doUnmock('@fastgpt/service/env');
      vi.resetModules();
    }
  });

  it('parses opensandbox config and runtime create config from env', async () => {
    getTestInstanceConfig().subservice.agentSandbox.provider =
      'opensandbox' ?? createDefaultInstanceConfig().subservice.agentSandbox.provider;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl =
      'http://opensandbox.local' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.baseUrl;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.apiKey =
      'opensandbox-key' ?? createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.apiKey;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime =
      'docker' ?? createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.runtime;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.image =
      'fastgpt-agent-sandbox:test' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.image;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerUrl =
      'http://volume-manager.local' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerUrl;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerToken =
      'volume-token' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.volumeManagerToken;

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
        readyTimeoutSeconds: 120,
        entrypoint: ['sh', '-c', 'echo ok'],
        env: { A: 'B' },
        metadata: { teamId: 'team-1' },
        networkPolicy: {
          defaultAction: 'allow',
          egress: defaultOpenSandboxNetworkPolicy.egress
        },
        extensions: {
          traceId: 'trace-1'
        },
        volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }]
      }
    });
  });

  it('builds opensandbox runtime create config from profile env image', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime =
      'docker' ?? createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.runtime;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.image =
      'default-opensandbox-image:stable' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.image;
    getTestInstanceConfig().subservice.agentSandbox.common.cpuCount = 2;
    getTestInstanceConfig().subservice.agentSandbox.common.memoryMiB = 4096;
    vi.resetModules();
    const { getSandboxRuntimeProfile } =
      await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile');
    const profile = getSandboxRuntimeProfile('opensandbox');
    const defaultConfig = profile.buildConfig();
    expect(defaultConfig).toEqual({
      image: {
        repository: 'default-opensandbox-image',
        tag: 'stable'
      },
      resourceLimits: {
        cpuCount: 2,
        memoryMiB: 4096
      },
      readyTimeoutSeconds: 120,
      networkPolicy: defaultOpenSandboxNetworkPolicy
    });

    expect(
      profile.buildConfig({
        entrypoint: profile.entrypoint
      })
    ).toEqual({
      ...defaultConfig,
      entrypoint: ['/home/sandbox/entrypoint.sh']
    });

    expect(
      profile.buildConfig({
        resourceLimits: { cpuCount: 3 }
      })?.resourceLimits
    ).toEqual({
      cpuCount: 3,
      memoryMiB: 4096
    });
  });

  it('does not pass OpenSandbox network isolation to kubernetes runtime', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime =
      'kubernetes' ?? createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.runtime;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.image =
      'default-opensandbox-image:stable' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.image;
    vi.resetModules();
    const { getSandboxRuntimeProfile } =
      await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile');
    const profile = getSandboxRuntimeProfile('opensandbox');

    expect(profile.buildConfig()?.networkPolicy).toBeUndefined();
    expect(
      profile.buildConfig({
        createConfig: {
          networkPolicy: {
            defaultAction: 'allow',
            egress: [{ action: 'deny', target: '10.0.0.1' }]
          }
        }
      })?.networkPolicy
    ).toBeUndefined();
  });

  it('keeps Docker OpenSandbox egress policy behavior', async () => {
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.runtime =
      'docker' ?? createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.runtime;
    getTestInstanceConfig().subservice.agentSandbox.opensandbox.image =
      'default-opensandbox-image:stable' ??
      createDefaultInstanceConfig().subservice.agentSandbox.opensandbox.image;
    vi.resetModules();
    const { getSandboxRuntimeProfile } =
      await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile');
    const profile = getSandboxRuntimeProfile('opensandbox');

    expect(
      profile.buildConfig({
        createConfig: {
          networkPolicy: {
            defaultAction: 'deny',
            egress: [
              { action: 'allow', target: '10.0.0.1' },
              { action: 'deny', target: 'api.example.com' }
            ]
          }
        }
      })?.networkPolicy
    ).toEqual({
      defaultAction: 'allow',
      egress: [
        ...defaultOpenSandboxNetworkPolicy.egress,
        { action: 'deny', target: 'api.example.com' }
      ]
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
        AGENT_SANDBOX_OPENSANDBOX_IMAGE: '',
        AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: true,
        AGENT_SANDBOX_CPU_COUNT: 1,
        AGENT_SANDBOX_MEMORY_MIB: 2048,
        AGENT_SANDBOX_STORAGE_SIZE_GI: 1
      }
    }));

    try {
      const { getSandboxRuntimeProfile } =
        await import('@fastgpt/service/core/ai/sandbox/infrastructure/provider/runtimeProfile');
      const runtimeProfile = getSandboxRuntimeProfile('opensandbox');

      expect(() => runtimeProfile.buildConfig()).toThrow(
        'Configure the OpenSandbox image in Agent Sandbox admin settings'
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
