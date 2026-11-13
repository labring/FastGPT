import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serviceEnv } from '@fastgpt/service/env';
import {
  buildOpenSandboxCreateConfig,
  getOpenSandboxClientConfig,
  getOpenSandboxRuntimeConfig
} from '@fastgpt/service/core/ai/sandbox/infrastructure/opensandbox';

const originalEnv = {
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
  AGENT_SANDBOX_OPENSANDBOX_RUNTIME: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
  AGENT_SANDBOX_CPU_COUNT: serviceEnv.AGENT_SANDBOX_CPU_COUNT,
  AGENT_SANDBOX_MEMORY_MIB: serviceEnv.AGENT_SANDBOX_MEMORY_MIB,
  AGENT_SANDBOX_STORAGE_SIZE_GI: serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI,
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL:
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL,
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN:
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN
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

describe('opensandbox config', () => {
  beforeEach(() => Object.assign(serviceEnv, originalEnv));
  afterEach(() => Object.assign(serviceEnv, originalEnv));

  it('requires baseUrl and apiKey when resolving client config', () => {
    Object.assign(serviceEnv, {
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: undefined,
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: undefined
    });
    expect(() => getOpenSandboxClientConfig()).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_BASEURL is required when Agent Sandbox is used'
    );

    Object.assign(serviceEnv, {
      AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
      AGENT_SANDBOX_OPENSANDBOX_API_KEY: undefined
    });
    expect(() => getOpenSandboxRuntimeConfig()).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_API_KEY is required for OpenSandbox'
    );
  });

  it('parses opensandbox config and runtime create config from env', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL = 'http://opensandbox.local';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY = 'opensandbox-key';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'docker';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'fastgpt-agent-sandbox:test';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL = 'http://volume-manager.local';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN = 'volume-token';

    expect(
      getOpenSandboxRuntimeConfig({
        runtime: true,
        resourceLimits: {
          cpuCount: 1,
          memoryMiB: 512
        },
        vmConfig: {
          volumes: [{ name: 'workspace', pvc: { claimName: 'claim-1' }, mountPath: '/workspace' }],
          storage: {
            volumes: [{ name: 'workspace', claimName: 'claim-1', mountPath: '/workspace' }]
          }
        },
        createConfig: {
          image: 'custom-image:custom',
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
      clientConfig: {
        baseUrl: 'http://opensandbox.local',
        apiKey: 'opensandbox-key'
      },
      createConfig: {
        image: 'custom-image:custom',
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

  it('builds opensandbox runtime create config from profile env image without forced entrypoint', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'docker';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'default-opensandbox-image:stable';
    serviceEnv.AGENT_SANDBOX_CPU_COUNT = 2;
    serviceEnv.AGENT_SANDBOX_MEMORY_MIB = 4096;
    const defaultConfig = buildOpenSandboxCreateConfig();
    expect(defaultConfig).toEqual({
      image: 'default-opensandbox-image:stable',
      resourceLimits: {
        cpuCount: 2,
        memoryMiB: 4096
      },
      readyTimeoutSeconds: 120,
      networkPolicy: defaultOpenSandboxNetworkPolicy
    });

    expect(
      buildOpenSandboxCreateConfig({
        entrypoint: ['/custom/entrypoint.sh']
      })
    ).toEqual({
      ...defaultConfig,
      entrypoint: ['/custom/entrypoint.sh']
    });

    expect(
      buildOpenSandboxCreateConfig({
        resourceLimits: { cpuCount: 3 }
      }).resourceLimits
    ).toEqual({
      cpuCount: 3,
      memoryMiB: 4096
    });
  });

  it('does not pass OpenSandbox network isolation to kubernetes runtime', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'kubernetes';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'default-opensandbox-image:stable';

    expect(buildOpenSandboxCreateConfig().networkPolicy).toBeUndefined();
    expect(
      buildOpenSandboxCreateConfig({
        createConfig: {
          networkPolicy: {
            defaultAction: 'allow',
            egress: [{ action: 'deny', target: '10.0.0.1' }]
          }
        }
      }).networkPolicy
    ).toBeUndefined();
  });

  it('keeps Docker OpenSandbox egress policy behavior', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_RUNTIME = 'docker';
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = 'default-opensandbox-image:stable';

    expect(
      buildOpenSandboxCreateConfig({
        createConfig: {
          networkPolicy: {
            defaultAction: 'deny',
            egress: [
              { action: 'allow', target: '10.0.0.1' },
              { action: 'deny', target: 'api.example.com' }
            ]
          }
        }
      }).networkPolicy
    ).toEqual({
      defaultAction: 'allow',
      egress: [
        ...defaultOpenSandboxNetworkPolicy.egress,
        { action: 'deny', target: 'api.example.com' }
      ]
    });
  });

  it('requires opensandbox default image when no explicit image is provided', () => {
    serviceEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE = '';
    expect(() => buildOpenSandboxCreateConfig()).toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE is required'
    );
    expect(buildOpenSandboxCreateConfig({ createConfig: { image: 'explicit-image' } }).image).toBe(
      'explicit-image'
    );
  });
});
