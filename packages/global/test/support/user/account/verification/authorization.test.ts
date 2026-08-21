import { describe, expect, it } from 'vitest';
import { OAuthEnum } from '../../../../../support/user/constant';
import { createAuthorizationUrl } from '../../../../../support/user/account/verification/authorization';

const config = {
  github: 'github-client',
  google: 'google-client',
  microsoft: {
    clientId: 'microsoft-client',
    tenantId: 'tenant-id'
  }
};

describe('createAuthorizationUrl', () => {
  it.each([
    [OAuthEnum.github, 'https://github.com/login/oauth/authorize'],
    [OAuthEnum.google, 'https://accounts.google.com/o/oauth2/v2/auth'],
    [OAuthEnum.microsoft, 'https://login.microsoftonline.com/tenant-id/oauth2/v2.0/authorize']
  ] as const)('uses the shared login URL contract for %s', (provider, origin) => {
    const url = new URL(
      createAuthorizationUrl({
        provider,
        redirectUri: 'https://fastgpt.example.com/login/provider?flow=login',
        state: 'login-state',
        interaction: 'login',
        config
      })
    );

    expect(`${url.origin}${url.pathname}`).toBe(origin);
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://fastgpt.example.com/login/provider?flow=login'
    );
    expect(url.searchParams.get('state')).toBe('login-state');
    expect(url.searchParams.get('prompt')).toBeNull();
  });

  it('uses account selection for Google and reauthentication for Microsoft', () => {
    for (const [provider, prompt] of [
      [OAuthEnum.google, 'select_account'],
      [OAuthEnum.microsoft, 'login']
    ] as const) {
      const url = new URL(
        createAuthorizationUrl({
          provider,
          redirectUri: 'https://fastgpt.example.com/login/provider',
          state: 'reauth-state',
          interaction: 'reauth',
          config
        })
      );

      expect(url.searchParams.get('state')).toBe('reauth-state');
      expect(url.searchParams.get('prompt')).toBe(prompt);
    }
  });

  it('rejects an unconfigured provider', () => {
    expect(() =>
      createAuthorizationUrl({
        provider: OAuthEnum.github,
        redirectUri: 'https://fastgpt.example.com/login/provider',
        state: 'state',
        interaction: 'login',
        config: {}
      })
    ).toThrow('GitHub OAuth is not configured');
  });
});
