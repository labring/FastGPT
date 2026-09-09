import { afterEach, describe, expect, it, vi } from 'vitest';

const validInvokeTokenSecret = 'fastgpt_test_invoke_token_secret_32';

const originalEnv = {
  DB_MAX_LINK: process.env.DB_MAX_LINK,
  SYSTEM_MIGRATION_BATCH_SIZE: process.env.SYSTEM_MIGRATION_BATCH_SIZE,
  SYSTEM_MAX_STRING_LENGTH_M: process.env.SYSTEM_MAX_STRING_LENGTH_M,
  XLSX_PARSE_MAX_ROWS: process.env.XLSX_PARSE_MAX_ROWS,
  XLSX_PARSE_MAX_COLUMNS: process.env.XLSX_PARSE_MAX_COLUMNS,
  XLSX_PARSE_MAX_CELLS: process.env.XLSX_PARSE_MAX_CELLS,
  XLSX_PARSE_MAX_MERGED_CELLS: process.env.XLSX_PARSE_MAX_MERGED_CELLS,
  AGENT_SANDBOX_CPU_COUNT: process.env.AGENT_SANDBOX_CPU_COUNT,
  AGENT_SANDBOX_MEMORY_MIB: process.env.AGENT_SANDBOX_MEMORY_MIB,
  AGENT_SANDBOX_STORAGE_SIZE_GI: process.env.AGENT_SANDBOX_STORAGE_SIZE_GI,
  FE_DOMAIN: process.env.FE_DOMAIN,
  AGENT_SANDBOX_SUSPEND_MINUTES: process.env.AGENT_SANDBOX_SUSPEND_MINUTES,
  AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS: process.env.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS,
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  FILE_DOWNLOAD_PUBLIC_URL_PREFIX: process.env.FILE_DOWNLOAD_PUBLIC_URL_PREFIX,
  STORAGE_DOWNLOAD_URL_MODE: process.env.STORAGE_DOWNLOAD_URL_MODE,
  SYNC_INDEX: process.env.SYNC_INDEX,
  DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED: process.env.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED,
  AES256_SECRET_KEY: process.env.AES256_SECRET_KEY,
  INVOKE_TOKEN_SECRET: process.env.INVOKE_TOKEN_SECRET,
  SOMARK_API_KEY: process.env.SOMARK_API_KEY,
  PRO_URL: process.env.PRO_URL,
  PRO_TOKEN: process.env.PRO_TOKEN,
  VITEST: process.env.VITEST,
  NODE_ENV: process.env.NODE_ENV,
  AGENT_SANDBOX_PROVIDER: process.env.AGENT_SANDBOX_PROVIDER,
  AGENT_SANDBOX_SEALOS_BASEURL: process.env.AGENT_SANDBOX_SEALOS_BASEURL,
  AGENT_SANDBOX_SEALOS_TOKEN: process.env.AGENT_SANDBOX_SEALOS_TOKEN,
  AGENT_SANDBOX_SEALOS_IMAGE: process.env.AGENT_SANDBOX_SEALOS_IMAGE,
  AGENT_SANDBOX_OPENSANDBOX_BASEURL: process.env.AGENT_SANDBOX_OPENSANDBOX_BASEURL,
  AGENT_SANDBOX_OPENSANDBOX_API_KEY: process.env.AGENT_SANDBOX_OPENSANDBOX_API_KEY,
  AGENT_SANDBOX_OPENSANDBOX_IMAGE: process.env.AGENT_SANDBOX_OPENSANDBOX_IMAGE,
  AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX:
    process.env.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX,
  AGENT_SANDBOX_APT_MIRROR: process.env.AGENT_SANDBOX_APT_MIRROR,
  MILVUS_LANGUAGE_IDENTIFIER: process.env.MILVUS_LANGUAGE_IDENTIFIER,
  MILVUS_ADDRESS: process.env.MILVUS_ADDRESS
};

const importServiceEnv = async () => {
  vi.resetModules();
  const { serviceEnv, SYSTEM_MAX_STRING_LENGTH } = await import('@fastgpt/service/env');
  return { serviceEnv, SYSTEM_MAX_STRING_LENGTH };
};

describe('serviceEnv', () => {
  afterEach(() => {
    vi.stubEnv('DB_MAX_LINK', originalEnv.DB_MAX_LINK);
    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', originalEnv.SYSTEM_MIGRATION_BATCH_SIZE);
    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', originalEnv.SYSTEM_MAX_STRING_LENGTH_M);
    vi.stubEnv('XLSX_PARSE_MAX_ROWS', originalEnv.XLSX_PARSE_MAX_ROWS);
    vi.stubEnv('XLSX_PARSE_MAX_COLUMNS', originalEnv.XLSX_PARSE_MAX_COLUMNS);
    vi.stubEnv('XLSX_PARSE_MAX_CELLS', originalEnv.XLSX_PARSE_MAX_CELLS);
    vi.stubEnv('XLSX_PARSE_MAX_MERGED_CELLS', originalEnv.XLSX_PARSE_MAX_MERGED_CELLS);
    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', originalEnv.AGENT_SANDBOX_CPU_COUNT);
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', originalEnv.AGENT_SANDBOX_MEMORY_MIB);
    vi.stubEnv('AGENT_SANDBOX_STORAGE_SIZE_GI', originalEnv.AGENT_SANDBOX_STORAGE_SIZE_GI);
    vi.stubEnv('FE_DOMAIN', originalEnv.FE_DOMAIN);
    vi.stubEnv('AGENT_SANDBOX_SUSPEND_MINUTES', originalEnv.AGENT_SANDBOX_SUSPEND_MINUTES);
    vi.stubEnv(
      'AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS',
      originalEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS
    );
    vi.stubEnv('FILE_TOKEN_KEY', originalEnv.FILE_TOKEN_KEY);
    vi.stubEnv('FILE_DOWNLOAD_PUBLIC_URL_PREFIX', originalEnv.FILE_DOWNLOAD_PUBLIC_URL_PREFIX);
    vi.stubEnv('STORAGE_DOWNLOAD_URL_MODE', originalEnv.STORAGE_DOWNLOAD_URL_MODE);
    vi.stubEnv('SYNC_INDEX', originalEnv.SYNC_INDEX);
    vi.stubEnv(
      'DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED',
      originalEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED
    );
    vi.stubEnv('AES256_SECRET_KEY', originalEnv.AES256_SECRET_KEY);
    vi.stubEnv('INVOKE_TOKEN_SECRET', originalEnv.INVOKE_TOKEN_SECRET);
    vi.stubEnv('SOMARK_API_KEY', originalEnv.SOMARK_API_KEY);
    vi.stubEnv('PRO_URL', originalEnv.PRO_URL);
    vi.stubEnv('PRO_TOKEN', originalEnv.PRO_TOKEN);
    vi.stubEnv('VITEST', originalEnv.VITEST);
    vi.stubEnv('NODE_ENV', originalEnv.NODE_ENV);
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', originalEnv.AGENT_SANDBOX_PROVIDER);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', originalEnv.AGENT_SANDBOX_SEALOS_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', originalEnv.AGENT_SANDBOX_SEALOS_TOKEN);
    vi.stubEnv('AGENT_SANDBOX_SEALOS_IMAGE', originalEnv.AGENT_SANDBOX_SEALOS_IMAGE);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', originalEnv.AGENT_SANDBOX_OPENSANDBOX_BASEURL);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', originalEnv.AGENT_SANDBOX_OPENSANDBOX_API_KEY);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', originalEnv.AGENT_SANDBOX_OPENSANDBOX_IMAGE);
    vi.stubEnv(
      'AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX',
      originalEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX
    );
    vi.stubEnv('AGENT_SANDBOX_APT_MIRROR', originalEnv.AGENT_SANDBOX_APT_MIRROR);
    vi.stubEnv('MILVUS_LANGUAGE_IDENTIFIER', originalEnv.MILVUS_LANGUAGE_IDENTIFIER);
    vi.stubEnv('MILVUS_ADDRESS', originalEnv.MILVUS_ADDRESS);
  });

  it('clamps DB_MAX_LINK to the supported connection pool range', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('DB_MAX_LINK', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DB_MAX_LINK: 10 }
    });

    vi.stubEnv('DB_MAX_LINK', '-1');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DB_MAX_LINK: 10 }
    });

    vi.stubEnv('DB_MAX_LINK', '5');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DB_MAX_LINK: 10 }
    });

    vi.stubEnv('DB_MAX_LINK', '20');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DB_MAX_LINK: 20 }
    });

    vi.stubEnv('DB_MAX_LINK', '1001');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DB_MAX_LINK: 1000 }
    });
  });

  it('enables MongoDB index synchronization by default and supports disabling it', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SYNC_INDEX', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYNC_INDEX: true }
    });

    vi.stubEnv('SYNC_INDEX', 'false');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYNC_INDEX: false }
    });
  });

  it('validates the system migration batch size during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYSTEM_MIGRATION_BATCH_SIZE: 100 }
    });

    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', '50');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYSTEM_MIGRATION_BATCH_SIZE: 50 }
    });

    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', '1000');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYSTEM_MIGRATION_BATCH_SIZE: 1000 }
    });

    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', '49');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', '1001');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MIGRATION_BATCH_SIZE', 'not-a-number');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
  });

  it('disables default team basic permissions by default and supports enabling them', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED: false }
    });

    vi.stubEnv('DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED', 'true');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED: true }
    });
  });

  it('reads the optional SoMark API key', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('SOMARK_API_KEY', 'sk-somark-test');

    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        SOMARK_API_KEY: 'sk-somark-test'
      }
    });
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

  it('validates the XLSX parsing limits during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('XLSX_PARSE_MAX_ROWS', undefined);
    vi.stubEnv('XLSX_PARSE_MAX_COLUMNS', undefined);
    vi.stubEnv('XLSX_PARSE_MAX_CELLS', undefined);
    vi.stubEnv('XLSX_PARSE_MAX_MERGED_CELLS', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        XLSX_PARSE_MAX_ROWS: 100_000,
        XLSX_PARSE_MAX_COLUMNS: 1_000,
        XLSX_PARSE_MAX_CELLS: 1_000_000,
        XLSX_PARSE_MAX_MERGED_CELLS: 1_000_000
      }
    });

    vi.stubEnv('XLSX_PARSE_MAX_ROWS', '120000');
    vi.stubEnv('XLSX_PARSE_MAX_COLUMNS', '1200');
    vi.stubEnv('XLSX_PARSE_MAX_CELLS', '1200000');
    vi.stubEnv('XLSX_PARSE_MAX_MERGED_CELLS', '1300000');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        XLSX_PARSE_MAX_ROWS: 120_000,
        XLSX_PARSE_MAX_COLUMNS: 1_200,
        XLSX_PARSE_MAX_CELLS: 1_200_000,
        XLSX_PARSE_MAX_MERGED_CELLS: 1_300_000
      }
    });

    vi.stubEnv('XLSX_PARSE_MAX_ROWS', '0');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('XLSX_PARSE_MAX_ROWS', '1048577');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('XLSX_PARSE_MAX_ROWS', '100000');
    vi.stubEnv('XLSX_PARSE_MAX_COLUMNS', '16385');
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

  it('validates shared Agent Sandbox resource limits during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', undefined);
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', undefined);
    vi.stubEnv('AGENT_SANDBOX_STORAGE_SIZE_GI', undefined);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX', undefined);
    const defaultEnv = await importServiceEnv();
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_CPU_COUNT).toBe(1);
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_MEMORY_MIB).toBe(2048);
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI).toBe(1);
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX).toBe(
      'fastgpt-session'
    );

    vi.stubEnv('AGENT_SANDBOX_CPU_COUNT', '2.5');
    vi.stubEnv('AGENT_SANDBOX_MEMORY_MIB', '4096');
    vi.stubEnv('AGENT_SANDBOX_STORAGE_SIZE_GI', '5');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX', 'custom-volume');
    const customEnv = await importServiceEnv();
    expect(customEnv.serviceEnv.AGENT_SANDBOX_CPU_COUNT).toBe(2.5);
    expect(customEnv.serviceEnv.AGENT_SANDBOX_MEMORY_MIB).toBe(4096);
    expect(customEnv.serviceEnv.AGENT_SANDBOX_STORAGE_SIZE_GI).toBe(5);
    expect(customEnv.serviceEnv.AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX).toBe('custom-volume');
  });

  it('reads the optional Agent Sandbox apt mirror value', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('AGENT_SANDBOX_APT_MIRROR', 'https://mirror.example.com/ubuntu');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { AGENT_SANDBOX_APT_MIRROR: 'https://mirror.example.com/ubuntu' }
    });

    vi.stubEnv('AGENT_SANDBOX_APT_MIRROR', 'not-a-url');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { AGENT_SANDBOX_APT_MIRROR: 'not-a-url' }
    });
  });

  it('rejects an invalid OpenSandbox volume name prefix', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX', 'invalid_prefix');

    await expect(importServiceEnv()).rejects.toThrow(
      'Invalid environment variables. Please check: AGENT_SANDBOX_OPENSANDBOX_VOLUME_NAME_PREFIX'
    );
  });

  it('validates Agent Sandbox lifecycle thresholds during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('AGENT_SANDBOX_SUSPEND_MINUTES', undefined);
    vi.stubEnv('AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS', undefined);
    const defaultEnv = await importServiceEnv();
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES).toBe(60);
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS).toBe(7);

    vi.stubEnv('AGENT_SANDBOX_SUSPEND_MINUTES', '90');
    vi.stubEnv('AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS', '14');
    const customEnv = await importServiceEnv();
    expect(customEnv.serviceEnv.AGENT_SANDBOX_SUSPEND_MINUTES).toBe(90);
    expect(customEnv.serviceEnv.AGENT_SANDBOX_ARCHIVE_INACTIVE_DAYS).toBe(14);
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
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE', 'fastgpt-agent-sandbox:latest');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL', 'http://mock-volume-manager.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN', 'mock-volume-manager-token');
    vi.stubEnv('AGENT_SANDBOX_PROXY_SECRET', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');

    await expect(importServiceEnv()).resolves.toBeDefined();
  });

  it('启用 opensandbox 后未配置新运行镜像会阻止启动', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://mock-opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'mock-opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO', 'legacy/runtime-image');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG', 'legacy-stable');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_URL', 'http://mock-volume-manager.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_VOLUME_MANAGER_TOKEN', 'mock-volume-manager-token');

    await expect(importServiceEnv()).rejects.toThrow(
      'AGENT_SANDBOX_OPENSANDBOX_IMAGE are required when AGENT_SANDBOX_PROVIDER is opensandbox'
    );
  });
});

describe('MILVUS_LANGUAGE_IDENTIFIER', () => {
  afterEach(() => {
    vi.stubEnv('MILVUS_LANGUAGE_IDENTIFIER', '');
    vi.stubEnv('MILVUS_ADDRESS', '');
  });

  it('TC-2.3 defaults to lingua identifier', async () => {
    vi.stubEnv('MILVUS_LANGUAGE_IDENTIFIER', '');
    const { serviceEnv } = await importServiceEnv();
    expect(serviceEnv.MILVUS_LANGUAGE_IDENTIFIER).toBe('lingua');
  });

  it('TC-2.5 no independent FULL_TEXT_ENGINE env field (fulltext follows vector provider)', async () => {
    vi.stubEnv('MILVUS_LANGUAGE_IDENTIFIER', '');
    const { serviceEnv } = await importServiceEnv();
    expect((serviceEnv as Record<string, unknown>).FULL_TEXT_ENGINE).toBeUndefined();
  });
});
