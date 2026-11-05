import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getRuntimeEnv,
  validateAgentSandboxPreviewProxyEnv,
  validateAgentSandboxProxyEnv,
  validateS3Env
} from '@fastgpt/service/env.util';

afterEach(() => vi.unstubAllEnvs());

describe('getRuntimeEnv', () => {
  it('injects test security credentials without creating AI Proxy runtime defaults', () => {
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('INVOKE_TOKEN_SECRET', undefined);
    vi.stubEnv('PRO_TOKEN', undefined);
    vi.stubEnv('AIPROXY_API_ENDPOINT', undefined);
    vi.stubEnv('AIPROXY_API_TOKEN', undefined);
    expect(getRuntimeEnv()).toMatchObject({
      INVOKE_TOKEN_SECRET: 'fastgpt_test_invoke_token_secret_32',
      PRO_TOKEN: 'fastgpt_test_pro_token_32_chars_min'
    });
    expect(getRuntimeEnv().AIPROXY_API_ENDPOINT).toBeUndefined();
    expect(getRuntimeEnv().AIPROXY_API_TOKEN).toBeUndefined();
  });
  it('does not provide missing production security credentials', () => {
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INVOKE_TOKEN_SECRET', undefined);
    vi.stubEnv('PRO_TOKEN', undefined);
    expect(getRuntimeEnv().INVOKE_TOKEN_SECRET).toBeUndefined();
    expect(getRuntimeEnv().PRO_TOKEN).toBeUndefined();
  });
});

describe('bootstrap S3 validation', () => {
  it('requires the R2 public endpoint and accepts configured infrastructure', () => {
    expect(() => validateS3Env({ STORAGE_VENDOR: 'r2' })).toThrow('STORAGE_R2_PUBLIC_ENDPOINT');
    expect(() =>
      validateS3Env({
        STORAGE_VENDOR: 'r2',
        STORAGE_R2_PUBLIC_ENDPOINT: 'https://assets.example.com'
      })
    ).not.toThrow();
    expect(() => validateS3Env({ STORAGE_VENDOR: 'minio' })).not.toThrow();
  });
});

describe('sandbox proxy ENV validation', () => {
  it('takes provider from the loaded config and ignores a retired ENV provider', () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', undefined);
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', undefined);
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', undefined);
    expect(() => validateAgentSandboxProxyEnv('none')).not.toThrow();
    expect(() => validateAgentSandboxProxyEnv('opensandbox')).toThrow('AGENT_SANDBOX_PROXY_SECRET');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', 'secret');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'wss://proxy.example.com');
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'https://preview.example.com');
    expect(() => validateAgentSandboxProxyEnv('opensandbox')).not.toThrow();
  });
  it('only requires the preview endpoint on Pro when config enables a provider', () => {
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', undefined);
    expect(() => validateAgentSandboxPreviewProxyEnv('none')).not.toThrow();
    expect(() => validateAgentSandboxPreviewProxyEnv('sealosdevbox')).toThrow(
      'AGENT_SANDBOX_PREVIEW_PROXY_URL'
    );
    vi.stubEnv('AGENT_SANDBOX_PREVIEW_PROXY_URL', 'https://preview.example.com');
    expect(() => validateAgentSandboxPreviewProxyEnv('sealosdevbox')).not.toThrow();
  });
});
