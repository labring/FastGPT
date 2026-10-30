import { describe, expect, it } from 'vitest';
import {
  buildOauthFeConfig,
  buildRegisterMethods
} from '../../../../common/system/config/frontendProjection';
import { resolveSystemInstanceConfig } from '../../../../common/system/config/schema';

const createAuth = (overrides: Parameters<typeof resolveSystemInstanceConfig>[0]['auth']) =>
  resolveSystemInstanceConfig({ auth: overrides }).auth;

describe('buildOauthFeConfig', () => {
  it('projects configured OAuth providers and hides providers with incomplete credentials', () => {
    const auth = createAuth({
      loginProviders: {
        github: { clientId: 'github-id', secret: 'github-secret' },
        google: { clientId: '', secret: 'google-secret' },
        wechat: { appId: 'wechat-id', appSecret: 'wechat-secret' },
        microsoft: {
          clientId: 'microsoft-id',
          secret: 'microsoft-secret',
          tenantId: 'tenant-id',
          customButton: 'Login with Microsoft'
        },
        wecom: { suiteId: 'suite-id', secret: '' }
      }
    });

    expect(buildOauthFeConfig(auth)).toEqual({
      github: 'github-id',
      google: undefined,
      wechat: 'wechat-id',
      microsoft: {
        clientId: 'microsoft-id',
        tenantId: 'tenant-id',
        customButton: 'Login with Microsoft'
      },
      wecom: false
    });
  });

  it('hides WeChat when its secret is missing', () => {
    const auth = createAuth({
      loginProviders: { wechat: { appId: 'wechat-id', appSecret: '' } }
    });

    expect(buildOauthFeConfig(auth).wechat).toBeUndefined();
  });
});

describe('buildRegisterMethods', () => {
  it('uses the historical default methods and applies the email registration switch', () => {
    expect(buildRegisterMethods({ auth: createAuth({}) })).toEqual(['phone']);

    const enabledAuth = createAuth({ loginProviders: { email: { register: true } } });
    expect(buildRegisterMethods({ auth: enabledAuth })).toEqual(['email', 'phone']);
  });

  it('preserves legacy custom methods while filtering email by the new switch', () => {
    expect(
      buildRegisterMethods({ legacyMethods: ['phone', 'email'], auth: createAuth({}) })
    ).toEqual(['phone']);
  });
});
