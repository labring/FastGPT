import { afterEach, describe, expect, it, vi } from 'vitest';
const importAppEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};
afterEach(() => vi.unstubAllEnvs());

describe('app deployment ENV', () => {
  it('keeps Git visibility in ENV with its community default', async () => {
    vi.stubEnv('SHOW_GIT', undefined);
    expect((await importAppEnv()).appEnv.SHOW_GIT).toBe(true);
    vi.stubEnv('SHOW_GIT', 'false');
    expect((await importAppEnv()).appEnv.SHOW_GIT).toBe(false);
  });
  it('does not declare or validate retired form configuration', async () => {
    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '-1');
    vi.stubEnv('WECOM_LOGIN_AUTO_REDIRECT', 'invalid-legacy-value');
    vi.stubEnv('SYSTEM_NAME', 'retired-name');
    const { appEnv } = await importAppEnv();
    expect(Object.keys(appEnv).sort()).toEqual(
      [
        'CHINESE_IP_REDIRECT_URL',
        'SHOW_GIT',
        'DISABLE_MARKETPLACE',
        'AGENT_SANDBOX_FREE_TIP',
        'AGENT_SANDBOX_SHOW_FREE_TIP'
      ].sort()
    );
  });
});
