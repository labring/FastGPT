import { afterEach, describe, expect, it, vi } from 'vitest';

const importAppEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

describe('app env validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('OPENAPI_KEY_MAX_COUNT 默认值为 100，且允许配置为最小值 1', async () => {
    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '');

    await expect(importAppEnv()).resolves.toMatchObject({
      appEnv: expect.objectContaining({
        OPENAPI_KEY_MAX_COUNT: 100
      })
    });

    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '1');

    await expect(importAppEnv()).resolves.toMatchObject({
      appEnv: expect.objectContaining({
        OPENAPI_KEY_MAX_COUNT: 1
      })
    });
  });

  it('WECOM_LOGIN_AUTO_REDIRECT 默认关闭，且支持显式开启', async () => {
    vi.stubEnv('WECOM_LOGIN_AUTO_REDIRECT', '');

    await expect(importAppEnv()).resolves.toMatchObject({
      appEnv: expect.objectContaining({
        WECOM_LOGIN_AUTO_REDIRECT: false
      })
    });

    vi.stubEnv('WECOM_LOGIN_AUTO_REDIRECT', 'true');

    await expect(importAppEnv()).resolves.toMatchObject({
      appEnv: expect.objectContaining({
        WECOM_LOGIN_AUTO_REDIRECT: true
      })
    });
  });

  it('OPENAPI_KEY_MAX_COUNT 必须是大于等于 1 的整数', async () => {
    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '0');

    await expect(importAppEnv()).rejects.toThrow('OPENAPI_KEY_MAX_COUNT');

    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '1.5');

    await expect(importAppEnv()).rejects.toThrow('OPENAPI_KEY_MAX_COUNT');
  });
});
