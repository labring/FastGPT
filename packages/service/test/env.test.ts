import { afterEach, describe, expect, it, vi } from 'vitest';

const validInvokeTokenSecret = 'fastgpt_test_invoke_token_secret_32';

const originalEnv = {
  SYSTEM_MAX_STRING_LENGTH_M: process.env.SYSTEM_MAX_STRING_LENGTH_M,
  AGENT_SANDBOX_DISK_MB: process.env.AGENT_SANDBOX_DISK_MB,
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  AES256_SECRET_KEY: process.env.AES256_SECRET_KEY,
  INVOKE_TOKEN_SECRET: process.env.INVOKE_TOKEN_SECRET,
  VITEST: process.env.VITEST,
  NODE_ENV: process.env.NODE_ENV,
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
  AGENT_SANDBOX_PROXY_URL: process.env.AGENT_SANDBOX_PROXY_URL
};

const importServiceEnv = async () => {
  vi.resetModules();
  const { serviceEnv, SYSTEM_MAX_STRING_LENGTH } = await import('@fastgpt/service/env');
  return { serviceEnv, SYSTEM_MAX_STRING_LENGTH };
};

describe('serviceEnv', () => {
  afterEach(() => {
    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', originalEnv.SYSTEM_MAX_STRING_LENGTH_M);
    vi.stubEnv('AGENT_SANDBOX_DISK_MB', originalEnv.AGENT_SANDBOX_DISK_MB);
    vi.stubEnv('FILE_TOKEN_KEY', originalEnv.FILE_TOKEN_KEY);
    vi.stubEnv('AES256_SECRET_KEY', originalEnv.AES256_SECRET_KEY);
    vi.stubEnv('INVOKE_TOKEN_SECRET', originalEnv.INVOKE_TOKEN_SECRET);
    vi.stubEnv('VITEST', originalEnv.VITEST);
    vi.stubEnv('NODE_ENV', originalEnv.NODE_ENV);
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_BASEURL',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL
    );
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_API_KEY',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY
    );
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', originalEnv.AGENT_SANDBOX_PROXY_URL);
  });

  it('validates SYSTEM_MAX_STRING_LENGTH_M during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      SYSTEM_MAX_STRING_LENGTH: 100_000_000,
      serviceEnv: {
        SYSTEM_MAX_STRING_LENGTH_M: 100
      }
    });

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', '2');
    await expect(importServiceEnv()).resolves.toMatchObject({
      SYSTEM_MAX_STRING_LENGTH: 2_000_000,
      serviceEnv: {
        SYSTEM_MAX_STRING_LENGTH_M: 2
      }
    });
  });

  it('rejects invalid SYSTEM_MAX_STRING_LENGTH_M during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', '0');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', '101');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', 'not-a-number');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
  });

  it('requires INVOKE_TOKEN_SECRET during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');

    vi.stubEnv('INVOKE_TOKEN_SECRET', undefined);
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('INVOKE_TOKEN_SECRET', 'short-token');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        INVOKE_TOKEN_SECRET: validInvokeTokenSecret
      }
    });
  });

  it('uses a test-only INVOKE_TOKEN_SECRET default during vitest', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', undefined);
    vi.stubEnv('VITEST', 'true');

    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        INVOKE_TOKEN_SECRET: validInvokeTokenSecret
      }
    });
  });

  it('validates AGENT_SANDBOX_DISK_MB during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('AGENT_SANDBOX_DISK_MB', undefined);
    const defaultEnv = await importServiceEnv();
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_DISK_MB).toBe(1024);

    vi.stubEnv('AGENT_SANDBOX_DISK_MB', '333');
    const customEnv = await importServiceEnv();
    expect(customEnv.serviceEnv.AGENT_SANDBOX_DISK_MB).toBe(333);
  });

  it('未启用 Agent Sandbox 时允许 AGENT_SANDBOX_PROXY_URL 为空', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');

    await expect(importServiceEnv()).resolves.toBeDefined();
  });

  it('启用 opensandbox 时要求配置 AGENT_SANDBOX_PROXY_URL', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://mock-opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'mock-opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');

    await expect(importServiceEnv()).rejects.toThrow('AGENT_SANDBOX_PROXY_URL is required');
  });

  it('启用 opensandbox 时要求 AGENT_SANDBOX_PROXY_URL 是 WebSocket 地址', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://mock-opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'mock-opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'http://localhost:1006');

    await expect(importServiceEnv()).rejects.toThrow('AGENT_SANDBOX_PROXY_URL');
  });
});
