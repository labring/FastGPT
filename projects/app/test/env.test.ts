import { afterEach, describe, expect, it, vi } from 'vitest';
const importAppEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};
afterEach(() => vi.unstubAllEnvs());

describe('app deployment ENV', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['true', true]
  ])('reads WeCom auto redirect from App ENV: %s', async (value, expected) => {
    vi.stubEnv('WECOM_LOGIN_AUTO_REDIRECT', value);
    expect((await importAppEnv()).appEnv.WECOM_LOGIN_AUTO_REDIRECT).toBe(expected);
  });

  it('defaults the commercial Git switch to false and accepts an explicit override', async () => {
    vi.stubEnv('PRO_URL', 'https://pro.example.com');
    vi.stubEnv('SHOW_GIT', undefined);
    expect((await importAppEnv()).appEnv.SHOW_GIT).toBe(false);
    vi.stubEnv('SHOW_GIT', 'true');
    expect((await importAppEnv()).appEnv.SHOW_GIT).toBe(true);
    vi.stubEnv('SHOW_GIT', 'false');
    expect((await importAppEnv()).appEnv.SHOW_GIT).toBe(false);
  });
  it('does not read or validate SHOW_GIT without PRO_URL', async () => {
    vi.stubEnv('PRO_URL', undefined);
    vi.stubEnv('SHOW_GIT', 'invalid-unused-community-value');
    await expect(importAppEnv()).resolves.toHaveProperty('appEnv.SHOW_GIT', false);
  });
  it('does not declare or validate retired form configuration', async () => {
    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '-1');
    vi.stubEnv('SYSTEM_NAME', 'retired-name');
    const { appEnv } = await importAppEnv();
    expect(Object.keys(appEnv).sort()).toEqual(
      [
        'CHINESE_IP_REDIRECT_URL',
        'SHOW_GIT',
        'DISABLE_MARKETPLACE',
        'WECOM_LOGIN_AUTO_REDIRECT'
      ].sort()
    );
  });
});
