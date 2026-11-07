import { describe, expect, it } from 'vitest';
import { normalizeSsoConfig } from '@fastgpt/global/common/system/config/sso';

describe('normalizeSsoConfig', () => {
  it('moves a legacy root address out of public configuration without mutating the source', () => {
    const publicConfig = {
      url: 'https://legacy-sso.example.com',
      title: 'SSO',
      autoLogin: true,
      disablePasswordForSsoUsers: true
    };
    const original = structuredClone(publicConfig);
    expect(normalizeSsoConfig({ publicConfig })).toEqual({
      publicConfig: {
        enabled: true,
        title: 'SSO',
        autoLogin: true,
        disablePasswordForSsoUsers: true
      },
      serverConfig: { url: 'https://legacy-sso.example.com' }
    });
    expect(publicConfig).toEqual(original);
  });

  it.each([{ url: 'https://current-sso.example.com' }, { url: '' }, {}])(
    'gives an explicit server configuration %j precedence over a legacy address',
    (serverConfig) => {
      const result = normalizeSsoConfig({
        publicConfig: { title: 'SSO', url: 'https://legacy-sso.example.com', enabled: true },
        serverConfig
      });
      expect(result.serverConfig).toEqual(serverConfig);
      expect(result.publicConfig).toEqual({ title: 'SSO', enabled: Boolean(serverConfig.url) });
      expect(result.publicConfig).not.toHaveProperty('url');
    }
  );

  it('derives capabilities from a server address even without public display settings', () => {
    expect(normalizeSsoConfig({ serverConfig: { url: 'http://sso.internal' } })).toEqual({
      publicConfig: { enabled: true },
      serverConfig: { url: 'http://sso.internal' }
    });
  });

  it('does not enable SSO from a persisted public capability alone', () => {
    expect(normalizeSsoConfig({ publicConfig: { enabled: true } })).toEqual({
      publicConfig: { enabled: false },
      serverConfig: undefined
    });
    expect(normalizeSsoConfig({})).toEqual({ publicConfig: undefined, serverConfig: undefined });
  });
});
