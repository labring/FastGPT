import { afterEach, describe, expect, it, vi } from 'vitest';

const validInvokeTokenSecret = 'fastgpt_test_invoke_token_secret_32';

const originalEnv = {
  SYSTEM_MAX_STRING_LENGTH_M: process.env.SYSTEM_MAX_STRING_LENGTH_M,
  AGENT_SANDBOX_DISK_MB: process.env.AGENT_SANDBOX_DISK_MB,
  FE_DOMAIN: process.env.FE_DOMAIN,
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  FILE_DOWNLOAD_PUBLIC_URL_PREFIX: process.env.FILE_DOWNLOAD_PUBLIC_URL_PREFIX,
  STORAGE_DOWNLOAD_URL_MODE: process.env.STORAGE_DOWNLOAD_URL_MODE,
  AES256_SECRET_KEY: process.env.AES256_SECRET_KEY,
  INVOKE_TOKEN_SECRET: process.env.INVOKE_TOKEN_SECRET,
  PRO_URL: process.env.PRO_URL,
  PRO_TOKEN: process.env.PRO_TOKEN,
  VITEST: process.env.VITEST,
  NODE_ENV: process.env.NODE_ENV,
  MONGO_INDEX_SYNC_MODE: process.env.MONGO_INDEX_SYNC_MODE,
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
  AGENT_SANDBOX_SEALOS_IMAGE: process.env.AGENT_SANDBOX_SEALOS_IMAGE,
  AGENT_SANDBOX_E2B_API_KEY: process.env.AGENT_SANDBOX_E2B_API_KEY,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY
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
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('FILE_TOKEN_KEY', originalEnv.FILE_TOKEN_KEY);
    vi.stubEnv('FILE_DOWNLOAD_PUBLIC_URL_PREFIX', originalEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX);
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', originalEnv.STORAGE_DOWNLOAD_URL_MODE);
    vi.stubEnv('AES256_SECRET_KEY', originalEnv.AES256_SECRET_KEY);
    vi.stubEnv('INVOKE_TOKEN_SECRET', originalEnv.INVOKE_TOKEN_SECRET);
    vi.stubEnv('PRO_URL', originalEnv.PRO_URL);
    vi.stubEnv('PRO_TOKEN', originalEnv.PRO_TOKEN);
    vi.stubEnv('VITEST', originalEnv.VITEST);
    vi.stubEnv('NODE_ENV', originalEnv.NODE_ENV);
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', originalEnv.MONGO_INDEX_SYNC_MODE);
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', originalEnv.AGENT_SANDBOX_SEALOS_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', originalEnv.AGENT_SANDBOX_SEALOS_TOKEN);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', originalEnv.AGENT_SANDBOX_SEALOS_IMAGE);
    vi.stubEnv('AGENT_SANDBOX_E2B_API_KEY', originalEnv.AGENT_SANDBOX_E2B_API_KEY);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', originalEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', originalEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY);
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

  it('parses MongoDB index sync mode during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('MONGO_INDEX_SYNC_MODE', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        MONGO_INDEX_SYNC_MODE: 'create'
      }
    });

    vi.stubEnv('MONGO_INDEX_SYNC_MODE', '');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        MONGO_INDEX_SYNC_MODE: 'create'
      }
    });

    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'off');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        MONGO_INDEX_SYNC_MODE: 'off'
      }
    });

    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'sync');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        MONGO_INDEX_SYNC_MODE: 'sync'
      }
    });

    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'dryRun');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        MONGO_INDEX_SYNC_MODE: 'dryRun'
      }
    });
  });

  it('rejects invalid MongoDB index sync mode during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('MONGO_INDEX_SYNC_MODE', 'migrate');

    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
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

  it('requires FE_DOMAIN during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('FE_DOMAIN', undefined);
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');

    await expect(importServiceEnv()).rejects.toThrow(
      'Invalid environment variables. Please check: FE_DOMAIN'
    );
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

  it('normalizes FILE_DOWNLOAD_PUBLIC_URL_PREFIX during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('FILE_DOWNLOAD_PUBLIC_URL_PREFIX', 'https://files.example.com/f/');

    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        FILE_DOWNLOAD_PUBLIC_URL_PREFIX: 'https://files.example.com/f'
      }
    });
  });

  it('rejects the removed presigned download mode during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', 'presigned');

    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
  });

  it('uses PRO_TOKEN only when configured or running tests', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('PRO_URL', undefined);

    vi.stubEnv('PRO_TOKEN', undefined);
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        PRO_TOKEN: undefined
      }
    });

    vi.stubEnv('VITEST', 'true');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        PRO_TOKEN: 'fastgpt_test_pro_token_32_chars_min'
      }
    });

    vi.stubEnv('PRO_TOKEN', 'custom_pro_token_32_chars_minimum');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        PRO_TOKEN: 'custom_pro_token_32_chars_minimum'
      }
    });
  });

  it('配置 PRO_URL 后必须同时配置合法 PRO_TOKEN', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');

    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('PRO_TOKEN', undefined);
    await expect(importServiceEnv()).rejects.toThrow(
      'PRO_TOKEN is required when PRO_URL is configured'
    );

    vi.stubEnv('PRO_TOKEN', 'short-token');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('PRO_TOKEN', 'custom_pro_token_32_chars_minimum');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        PRO_URL: 'https://pro.example.com',
        PRO_TOKEN: 'custom_pro_token_32_chars_minimum'
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

  it('配置 sealosdevbox 后缺少运行镜像会阻止启动', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'sealosdevbox');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', 'http://mock-sealos.local');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', 'mock-sealos-token');
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', '');

    await expect(importServiceEnv()).rejects.toThrow(
      'AGENT_SANDBOX_SEALOS_IMAGE are required when AGENT_SANDBOX_PROVIDER is sealosdevbox'
    );
  });

  it('启用 Agent Sandbox 时不要求共享服务配置 app proxy 环境变量', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://mock-opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'mock-opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL', 'http://mock-volume-manager.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN', 'mock-volume-manager-token');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');

    await expect(importServiceEnv()).resolves.toBeDefined();
  });
});
