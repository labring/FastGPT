import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeEnv, validateDbEnv, validateS3Env } from '@fastgpt/service/env.util';

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

describe('bootstrap DB validation', () => {
  it('requires OCEANBASE_DB_URI only for oceanbase dialect and rejects invalid URLs without leaking credentials', () => {
    expect(() => validateDbEnv({ DB_DIALECT: 'mongo' })).not.toThrow();
    expect(() => validateDbEnv({ DB_DIALECT: 'oceanbase' })).toThrow('OCEANBASE_DB_URI');

    let caughtMsg = '';
    try {
      validateDbEnv({
        DB_DIALECT: 'oceanbase',
        OCEANBASE_DB_URI: 'postgres://admin:top-secret-pass@127.0.0.1:5432/db'
      });
    } catch (error) {
      caughtMsg = error instanceof Error ? error.message : String(error);
    }
    expect(caughtMsg).toContain('OCEANBASE_DB_URI');
    expect(caughtMsg).not.toContain('top-secret-pass');

    expect(() =>
      validateDbEnv({
        DB_DIALECT: 'oceanbase',
        OCEANBASE_DB_URI: 'mysql://root@127.0.0.1:2881/fastgpt',
        OCEANBASE_LOG_DB_URI: 'not-a-url'
      })
    ).toThrow('OCEANBASE_LOG_DB_URI');

    expect(() =>
      validateDbEnv({
        DB_DIALECT: 'oceanbase',
        OCEANBASE_DB_URI: 'mysql://root@127.0.0.1:2881/fastgpt',
        OCEANBASE_DB_READ_URI: 'mysql://'
      })
    ).toThrow('OCEANBASE_DB_READ_URI');

    expect(() =>
      validateDbEnv({
        DB_DIALECT: 'oceanbase',
        OCEANBASE_DB_URI: 'mysql://root@127.0.0.1:2881/fastgpt',
        OCEANBASE_LOG_DB_URI: 'mysql://root@127.0.0.1:2883/fastgpt_log',
        OCEANBASE_DB_READ_URI: 'mysql://root@127.0.0.1:2882/fastgpt_ro'
      })
    ).not.toThrow();
  });
});
