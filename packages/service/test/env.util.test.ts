import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getRuntimeEnv,
  getAgentSandboxMissingRequiredEnvKeys,
  resolveAgentSandboxPreviewProxyBaseUrl,
  resolveAgentSandboxTerminalProxyUrl,
  validateAgentSandboxPreviewProxyEnv,
  validateAgentSandboxProxyEnv,
  validateS3Env
} from '@fastgpt/service/env.util';

describe('getRuntimeEnv AI Proxy test defaults', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['vitest', 'test'])('injects isolated defaults only for %s', (mode) => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', undefined);
    vi.stubEnv('AIPROXY_API_TOKEN', undefined);
    vi.stubEnv('VITEST', mode === 'vitest' ? 'true' : undefined);
    vi.stubEnv('NODE_ENV', mode === 'test' ? 'test' : 'development');
    expect(getRuntimeEnv()).toMatchObject({
      AIPROXY_API_ENDPOINT: 'http://127.0.0.1:3000',
      AIPROXY_API_TOKEN: 'test-aiproxy-token'
    });
    expect(process.env.AIPROXY_API_TOKEN).toBeUndefined();
  });

  it('does not supply AI Proxy configuration in production', () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', undefined);
    vi.stubEnv('AIPROXY_API_TOKEN', undefined);
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    expect(getRuntimeEnv().AIPROXY_API_ENDPOINT).toBeUndefined();
    expect(getRuntimeEnv().AIPROXY_API_TOKEN).toBeUndefined();
  });

  it('preserves explicitly configured and blank values for schema validation', () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'https://proxy.example.com');
    vi.stubEnv('AIPROXY_API_TOKEN', '');
    vi.stubEnv('VITEST', 'true');
    expect(getRuntimeEnv()).toMatchObject({
      AIPROXY_API_ENDPOINT: 'https://proxy.example.com',
      AIPROXY_API_TOKEN: ''
    });
  });
});

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

  it('requires a public endpoint for R2', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_VENDOR: 'r2'
      })
    ).toThrow('STORAGE_R2_PUBLIC_ENDPOINT');
  });

  it('rejects CDN URL rewriting for R2', () => {
    expect(() =>
      validateS3Env({
        ...baseEnv,
        STORAGE_VENDOR: 'r2',
        STORAGE_R2_PUBLIC_ENDPOINT: 'https://assets.example.com',
        STORAGE_EXTERNAL_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
        STORAGE_S3_CDN_ENDPOINT: 'https://cdn.example.com'
      })
    ).toThrow('STORAGE_S3_CDN_ENDPOINT is not supported');
  });
});

describe('env util', () => {
  it('requires opensandbox image and volume manager env when AGENT_SANDBOX_OPENSANDBOX_BASEURL is configured', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
        AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'opensandbox-key'
      } as NodeJS.ProcessEnv)
    ).toEqual([
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE',
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL',
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN'
    ]);
  });

  it('requires the new opensandbox image even when legacy image variables are set', () => {
    expect(
      getAgentSandboxMissingRequiredEnvKeys({
        AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://opensandbox.local',
        AGENT_SANDBOX_OPENSANDBOX_API_KEY: 'opensandbox-key',
        AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'legacy/runtime',
        AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: 'legacy-stable',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL: 'http://volume-manager.local',
        AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN: 'volume-token'
      } as NodeJS.ProcessEnv)
    ).toEqual(['AGENT_SANDBOX_OPENSANDBOX_IMAGE']);
  });

  it('does not require sandbox env when AGENT_SANDBOX_OPENSANDBOX_BASEURL is empty', () => {
    expect(getAgentSandboxMissingRequiredEnvKeys({} as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe('sandbox proxy URL normalization and validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('derives ws(s) /terminal and http(s) preview base URLs from AGENT_SANDBOX_PROXY_URL', () => {
    expect(resolveAgentSandboxTerminalProxyUrl('http://localhost:1006')).toBe(
      'ws://localhost:1006/terminal'
    );
    expect(resolveAgentSandboxTerminalProxyUrl('https://sandbox.example.com/edge/')).toBe(
      'wss://sandbox.example.com/edge/terminal'
    );
    expect(resolveAgentSandboxTerminalProxyUrl('wss://sandbox.example.com/terminal')).toBe(
      'wss://sandbox.example.com/terminal'
    );

    expect(
      resolveAgentSandboxPreviewProxyBaseUrl({
        proxyUrl: 'ws://localhost:1006/terminal'
      })
    ).toBe('http://localhost:1006');
    expect(
      resolveAgentSandboxPreviewProxyBaseUrl({
        proxyUrl: 'https://sandbox.example.com/edge/'
      })
    ).toBe('https://sandbox.example.com/edge');
    expect(
      resolveAgentSandboxPreviewProxyBaseUrl({
        proxyUrl: 'http://localhost:1006',
        previewProxyUrl: 'http://localhost:1007/'
      })
    ).toBe('http://localhost:1007');
  });

  it('skips validation when Agent Sandbox is disabled', () => {
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', '');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', '');

    expect(() => validateAgentSandboxProxyEnv()).not.toThrow();
    expect(() => validateAgentSandboxPreviewProxyEnv()).not.toThrow();
  });

  it('validates AGENT_SANDBOX_PROXY_URL and AGENT_SANDBOX_PROXY_SECRET for fastgpt-app', () => {
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', '');

    expect(() => validateAgentSandboxProxyEnv()).toThrow(
      'AGENT_SANDBOX_PROXY_URL, AGENT_SANDBOX_PROXY_SECRET are required'
    );

    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'http://localhost:1006');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', 'proxy-secret');
    expect(() => validateAgentSandboxProxyEnv()).not.toThrow();

    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'ws://invalid-preview:1007');
    expect(() => validateAgentSandboxProxyEnv()).toThrow(
      'AGENT_SANDBOX_PREVIEW_PROXY_URL must start with http:// or https://'
    );
  });

  it('allows validateAgentSandboxPreviewProxyEnv to accept either AGENT_SANDBOX_PROXY_URL or AGENT_SANDBOX_PREVIEW_PROXY_URL', () => {
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', '');

    expect(() => validateAgentSandboxPreviewProxyEnv()).toThrow(
      'AGENT_SANDBOX_PROXY_URL or AGENT_SANDBOX_PREVIEW_PROXY_URL is required'
    );

    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'ws://localhost:1006');
    expect(() => validateAgentSandboxPreviewProxyEnv()).not.toThrow();

    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'https://preview.example.com');
    expect(() => validateAgentSandboxPreviewProxyEnv()).not.toThrow();
  });
});
