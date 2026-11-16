import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeEnv, validateS3Env } from '@fastgpt/service/env.util';

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
