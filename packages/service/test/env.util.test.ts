import { describe, expect, it } from 'vitest';

import { getAgentSandboxMissingRequiredEnvKeys, validateS3Env } from '@fastgpt/service/env.util';

describe('validateS3Env', () => {
  const baseEnv = {
    STORAGE_VENDOR: 'minio' as const,
    STORAGE_DOWNLOAD_URL_MODE: 'short-proxy' as const
  };

  it('allows short proxy mode without an external endpoint', () => {
    expect(() => validateS3Env(baseEnv)).not.toThrow();
  });

  it.each(['short-redirect', 'presigned'] as const)(
    'requires an external endpoint for MinIO %s mode',
    (mode) => {
      expect(() =>
        validateS3Env({
          ...baseEnv,
          STORAGE_DOWNLOAD_URL_MODE: mode
        })
      ).toThrow(
        `STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_VENDOR is minio and STORAGE_DOWNLOAD_URL_MODE is ${mode}`
      );
    }
  );

  it('requires an external endpoint for AWS S3 presigned mode', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_VENDOR: 'aws-s3',
        STORAGE_DOWNLOAD_URL_MODE: 'presigned'
      })
    ).toThrow(
      'STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_VENDOR is aws-s3 and STORAGE_DOWNLOAD_URL_MODE is presigned'
    );
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

  it('requires an external endpoint when a CDN endpoint is configured', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_S3_CDN_ENDPOINT: 'https://cdn.example.com'
      })
    ).toThrow('STORAGE_EXTERNAL_ENDPOINT is required when STORAGE_S3_CDN_ENDPOINT is configured');
  });

  it('accepts a CDN endpoint when an external endpoint is also configured', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
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
          STORAGE_DOWNLOAD_URL_MODE: 'presigned'
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

  it('does not require opensandbox volume manager env for other providers', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_PROVIDER: 'e2b',
        AGENT_SANDBOX_E2B_API_KEY: 'e2b-key'
      } as NodeJS.ProcessEnv)
    ).toEqual([]);
  });
});
