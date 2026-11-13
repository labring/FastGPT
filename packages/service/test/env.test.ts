import { afterEach, describe, expect, it, vi } from 'vitest';
const validInvokeTokenSecret = 'fastgpt_test_invoke_token_secret_32';
const importServiceEnv = async () => {
  vi.resetModules();
  const { serviceEnv } = await import('@fastgpt/service/env');
  return { serviceEnv };
};
afterEach(() => vi.unstubAllEnvs());
describe('serviceEnv bootstrap configuration', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true]
  ])('parses auxiliary generation detail switch %s as %s', async (value, expected) => {
    vi.stubEnv('AUXILIARY_GENERATION_SHOW_RUN_DETAIL', value);
    const { serviceEnv } = await importServiceEnv();
    expect(serviceEnv.AUXILIARY_GENERATION_SHOW_RUN_DETAIL).toBe(expected);
  });
  it.each([
    [undefined, false],
    ['false', false],
    ['true', true]
  ] as const)('reads new-team basic permissions from ENV: %s', async (value, expected) => {
    vi.stubEnv('DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED', value);
    const { serviceEnv } = await importServiceEnv();
    expect(serviceEnv.DEFAULT_TEAM_BASIC_PERMISSIONS_ENABLED).toBe(expected);
  });

  it.each([
    [undefined, 0],
    ['0', 0],
    ['20', 20]
  ] as const)('reads the retrieval log limit from ENV: %s', async (value, expected) => {
    vi.stubEnv('RETRIEVAL_RESULTS_LIMIT', value);
    const { serviceEnv } = await importServiceEnv();
    expect(serviceEnv.RETRIEVAL_RESULTS_LIMIT).toBe(expected);
  });

  it('rejects a negative retrieval log limit', async () => {
    vi.stubEnv('RETRIEVAL_RESULTS_LIMIT', '-1');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
  });

  it('ignores the retired HNSW scan budget environment variable', async () => {
    vi.stubEnv('HNSW_MAX_SCAN_TUPLES', 'no-longer-used');
    const { serviceEnv } = await importServiceEnv();
    expect(serviceEnv).not.toHaveProperty('HNSW_MAX_SCAN_TUPLES');
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

  it.each([undefined, 'false', 'invalid'])('ignores retired SYNC_INDEX=%s', async (value) => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SYNC_INDEX', value);
    const { serviceEnv } = await importServiceEnv();
    expect('SYNC_INDEX' in serviceEnv).toBe(false);
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
  it('validates system migration delay seconds', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SYSTEM_MIGRATION_DELAY_SECONDS', undefined);
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYSTEM_MIGRATION_DELAY_SECONDS: 0 }
    });

    vi.stubEnv('SYSTEM_MIGRATION_DELAY_SECONDS', '300');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: { SYSTEM_MIGRATION_DELAY_SECONDS: 300 }
    });

    vi.stubEnv('SYSTEM_MIGRATION_DELAY_SECONDS', '-1');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MIGRATION_DELAY_SECONDS', 'not-a-number');
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
  it('does not require a password change session secret during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);
    vi.stubEnv('VITEST', undefined);
    vi.stubEnv('NODE_ENV', 'production');

    await expect(importServiceEnv()).resolves.not.toThrow();
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
  it.each([
    { proUrl: undefined, configured: undefined, expected: true },
    { proUrl: undefined, configured: 'false', expected: true },
    { proUrl: undefined, configured: 'invalid', expected: true },
    { proUrl: '', configured: undefined, expected: true },
    { proUrl: 'https://pro.example.com', configured: undefined, expected: false },
    { proUrl: 'https://pro.example.com', configured: '', expected: false },
    { proUrl: 'https://pro.example.com', configured: 'false', expected: false },
    { proUrl: 'https://pro.example.com', configured: 'true', expected: true },
    { proUrl: 'https://pro.example.com', configured: 'invalid', expected: false }
  ])(
    'resolves share branding with PRO_URL=$proUrl and SHOW_OUTLINK_BRAND=$configured as $expected',
    async ({ proUrl, configured, expected }) => {
      vi.stubEnv('PRO_URL', proUrl);
      vi.stubEnv('PRO_TOKEN', 'custom_pro_token_32_chars_minimum');
      vi.stubEnv('SHOW_OUTLINK_BRAND', configured);

      const { serviceEnv } = await importServiceEnv();
      expect(serviceEnv.SHOW_OUTLINK_BRAND).toBe(expected);
      expect(process.env.SHOW_OUTLINK_BRAND).toBe(configured);
    }
  );
  it.each(['AGENT_SANDBOX_CPU_OVERCOMMIT_FACTOR', 'AGENT_SANDBOX_MEMORY_OVERCOMMIT_FACTOR'])(
    'rejects invalid overcommit factors for %s at the env boundary',
    async (name) => {
      for (const value of ['0', '0.5', 'Infinity', 'NaN']) {
        vi.stubEnv(name, value);
        await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
      }
    }
  );
  it('defaults AGENT_SANDBOX_SHOW_FREE_TIP to false and supports enabling it', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('AGENT_SANDBOX_FREE_TIP', 'true');
    vi.stubEnv('AGENT_SANDBOX_SHOW_FREE_TIP', undefined);
    const defaultEnv = await importServiceEnv();
    expect(defaultEnv.serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP).toBe(false);

    vi.stubEnv('AGENT_SANDBOX_SHOW_FREE_TIP', 'true');
    const enabledEnv = await importServiceEnv();
    expect(enabledEnv.serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP).toBe(true);

    vi.stubEnv('AGENT_SANDBOX_SHOW_FREE_TIP', 'false');
    const disabledEnv = await importServiceEnv();
    expect(disabledEnv.serviceEnv.AGENT_SANDBOX_SHOW_FREE_TIP).toBe(false);
  });
  it('非法 SANGFOR_CHUNK_URL 直接启动校验失败,合法地址去掉尾部斜杠', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');
    vi.stubEnv('INVOKE_TOKEN_SECRET', validInvokeTokenSecret);

    vi.stubEnv('SANGFOR_CHUNK_URL', 'not-a-valid-url');
    await expect(importServiceEnv()).rejects.toThrow(/SANGFOR_CHUNK_URL/);

    vi.stubEnv('SANGFOR_CHUNK_URL', 'http://chunk-service.example/v1/chunk/');
    const validEnv = await importServiceEnv();
    expect(validEnv.serviceEnv.SANGFOR_CHUNK_URL).toBe('http://chunk-service.example/v1/chunk');

    vi.stubEnv('SANGFOR_CHUNK_URL', undefined);
    const unsetEnv = await importServiceEnv();
    expect(unsetEnv.serviceEnv.SANGFOR_CHUNK_URL).toBeUndefined();
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
  it('ignores retired instance configuration variables, including invalid legacy values', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'aeskey123456');
    vi.stubEnv('FE_DOMAIN', 'https://app.example.com');
    vi.stubEnv('WORKFLOW_MAX_RUN_TIMES', '-100');
    vi.stubEnv('DATASET_ARCHIVE_MAX_FILES', '0');
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'invalid-provider');
    vi.stubEnv('CODE_SANDBOX_URL', 'invalid-legacy-code-url');
    vi.stubEnv('CODE_SANDBOX_TOKEN', 'legacy-token');
    vi.stubEnv('SSE_MCP_SERVER_PROXY_ENDPOINT', 'invalid-legacy-mcp-url');
    const { serviceEnv } = await importServiceEnv();
    for (const key of [
      'CODE_SANDBOX_URL',
      'CODE_SANDBOX_TOKEN',
      'SSE_MCP_SERVER_PROXY_ENDPOINT',
      'WORKFLOW_MAX_RUN_TIMES',
      'AGENT_SANDBOX_PROVIDER',
      'STORAGE_EXTERNAL_ENDPOINT',
      'USE_IP_LIMIT',
      'FILE_URL_EXPIRED_DAYS',
      'CUSTOM_PDF_PARSE_KEY',
      'DATASET_ARCHIVE_MAX_FILES',
      'DATASET_ARCHIVE_MAX_SOURCE_SIZE_MB',
      'DATASET_ARCHIVE_MAX_CONCURRENCY',
      'DATASET_ARCHIVE_PREPARE_TIMEOUT_SECONDS'
    ]) {
      expect(Object.keys(serviceEnv)).not.toContain(key);
    }
  });
});
