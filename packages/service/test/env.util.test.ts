import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getAgentSandboxMissingRequiredEnvKeys,
  validateAgentSandboxProxyEnv,
  validateS3Env
} from '@fastgpt/service/env.util';

describe('validateS3Env', () => {
  const baseEnv = {
    STORAGE_VENDOR: 'minio' as const,
    STORAGE_DOWNLOAD_URL_MODE: 'short-proxy' as const
  };

  it('allows short proxy mode without an external endpoint', () => {
    expect(() => validateS3Env(baseEnv)).not.toThrow();
  });

  it('requires an external endpoint when a CDN endpoint is configured', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_S3_CDN_ENDPOINT: 'https://cdn.example.com'
      })
    ).toThrow('STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_S3_CDN_ENDPOINT is configured');
  });

  it('requires an external endpoint for MinIO short redirect mode', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_DOWNLOAD_URL_MODE: 'short-redirect'
      })
    ).toThrow(
      'STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_VENDOR is minio and STORAGE_DOWNLOAD_URL_MODE is short-redirect'
    );
  });

  it('allows AWS S3 to use its vendor-managed public endpoint', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_VENDOR: 'aws-s3',
        STORAGE_DOWNLOAD_URL_MODE: 'short-redirect'
      })
    ).not.toThrow();
  });

  it('accepts an external endpoint for direct download modes', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_DOWNLOAD_URL_MODE: 'short-redirect',
        STORAGE_EXTERNAL_ENDPOINT: 'https://s3.example.com'
      })
    ).not.toThrow();
  });

  it('does not treat a CDN endpoint as the MinIO external address', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_DOWNLOAD_URL_MODE: 'short-redirect',
        STORAGE_S3_CDN_ENDPOINT: 'https://cdn.example.com'
      })
    ).toThrow('STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_S3_CDN_ENDPOINT is configured');
  });

  it('accepts a CDN endpoint when an external endpoint is also configured', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_DOWNLOAD_URL_MODE: 'short-redirect',
        STORAGE_EXTERNAL_ENDPOINT: 'https://s3.example.com',
        STORAGE_S3_CDN_ENDPOINT: 'https://cdn.example.com'
      })
    ).not.toThrow();
  });

  it.each(['cos', 'oss'] as const)(
    'allows %s to use its vendor-managed public endpoint',
    (vendor) => {
      expect(() =>
        validateS3Env({
          ...baseEnv,
          STORAGE_VENDOR: vendor,
          STORAGE_DOWNLOAD_URL_MODE: 'short-redirect'
        })
      ).not.toThrow();
    }
  );
});

describe('env util', () => {
  it('requires opensandbox volume manager env when opensandbox provider is enabled', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_PROVIDER: 'opensandbox',
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
        AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'opensandbox-key'
      } as NodeJS.ProcessEnv)
    ).toEqual([
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
    ]);
  });

  it('does not require sandbox env for an unsupported provider', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_PROVIDER: 'unsupported'
      } as NodeJS.ProcessEnv)
    ).toEqual([]);
  });
});

describe('validateAgentSandboxProxyEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires separate WebSocket and Preview proxy URLs', () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', 'test-secret');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'ws://proxy.example.com');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', '');

    expect(() => validateAgentSandboxProxyEnv()).toThrow(
      'AGENT_SANDBOX_PREVIEW_PROXY_URL are required'
    );

    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'https://preview.example.com');
    expect(() => validateAgentSandboxProxyEnv()).not.toThrow();
  });
});
