import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  SYSTEM_MAX_STRING_LENGTH_M: process.env.SYSTEM_MAX_STRING_LENGTH_M,
  CHAT_TITLE_MODEL: process.env.CHAT_TITLE_MODEL,
  FILE_TOKEN_KEY: process.env.FILE_TOKEN_KEY,
  AES256_SECRET_KEY: process.env.AES256_SECRET_KEY
};

const importServiceEnv = async () => {
  vi.resetModules();
  const { serviceEnv, SYSTEM_MAX_STRING_LENGTH } = await import('@fastgpt/service/env');
  return { serviceEnv, SYSTEM_MAX_STRING_LENGTH };
};

describe('serviceEnv', () => {
  afterEach(() => {
    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', originalEnv.SYSTEM_MAX_STRING_LENGTH_M);
    vi.stubEnv('CHAT_TITLE_MODEL', originalEnv.CHAT_TITLE_MODEL);
    vi.stubEnv('FILE_TOKEN_KEY', originalEnv.FILE_TOKEN_KEY);
    vi.stubEnv('AES256_SECRET_KEY', originalEnv.AES256_SECRET_KEY);
  });

  it('validates SYSTEM_MAX_STRING_LENGTH_M during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');

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

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', '0');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', '101');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');

    vi.stubEnv('SYSTEM_MAX_STRING_LENGTH_M', 'not-a-number');
    await expect(importServiceEnv()).rejects.toThrow('Invalid environment variables');
  });

  it('validates chat title generation env during service env init', async () => {
    vi.stubEnv('FILE_TOKEN_KEY', 'filetokenkey');
    vi.stubEnv('AES256_SECRET_KEY', 'fastgptsecret');

    vi.stubEnv('CHAT_TITLE_MODEL', 'title-model');
    await expect(importServiceEnv()).resolves.toMatchObject({
      serviceEnv: {
        CHAT_TITLE_MODEL: 'title-model'
      }
    });
  });
});
