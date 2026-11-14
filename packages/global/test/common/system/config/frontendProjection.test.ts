import { describe, expect, it } from 'vitest';
import {
  buildAuthMethodProjection,
  buildOauthFeConfig,
  buildPayConfig,
  buildRegisterMethods,
  hasPayChannel
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
          tenantId: 'tenant-id'
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
        tenantId: 'tenant-id'
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
  const phoneReadyAuth = createAuth({
    loginProviders: {
      email: { smtp: 'smtp.example.com', user: 'user', pass: 'pass', register: true },
      phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' },
      sms: {
        login: { zh: 'LOGIN' },
        register: { zh: 'REGISTER' },
        resetPassword: { zh: 'RESET' },
        bindNotification: { zh: 'BIND' }
      }
    }
  });

  it('derives registration methods from the email switch and SMS channel', () => {
    expect(buildRegisterMethods({ auth: createAuth({}) })).toEqual([]);
    expect(
      buildRegisterMethods({ auth: createAuth({ loginProviders: { email: { register: true } } }) })
    ).toEqual(['email']);
    expect(buildRegisterMethods({ auth: phoneReadyAuth })).toEqual(['email', 'phone']);
  });

  it('does not add phone registration without both SMS channel and template', () => {
    const noTemplate = createAuth({
      loginProviders: {
        phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' }
      }
    });
    expect(buildRegisterMethods({ auth: noTemplate })).toEqual([]);

    const noChannel = createAuth({
      loginProviders: { sms: { register: { zh: 'REGISTER' } } }
    });
    expect(buildRegisterMethods({ auth: noChannel })).toEqual([]);
  });

  it('preserves sync as a historical team-mode compatibility value', () => {
    expect(buildRegisterMethods({ legacyMethods: ['sync'], auth: createAuth({}) })).toEqual([
      'sync'
    ]);
    expect(
      buildRegisterMethods({
        auth: createAuth({ teamMode: 'sync', loginProviders: { email: { register: true } } })
      })
    ).toEqual(['email', 'sync']);
  });

  it('derives login, find-password and bind-notification methods', () => {
    expect(buildAuthMethodProjection({ auth: phoneReadyAuth })).toEqual({
      login_method: ['email', 'phone'],
      register_method: ['email', 'phone'],
      find_password_method: ['email', 'phone'],
      bind_notification_method: ['email', 'phone']
    });

    const emailLoginOnly = createAuth({});
    expect(buildAuthMethodProjection({ auth: emailLoginOnly })).toEqual({
      login_method: ['email'],
      register_method: [],
      find_password_method: [],
      bind_notification_method: []
    });
  });
});

describe('buildPayConfig', () => {
  it('projects every channel whose complete credential is present', () => {
    const commercial = resolveSystemInstanceConfig({
      commercial: {
        payment: {
          wx: { privateKey: 'wx-private-key' },
          alipay: { rootCertContent: 'alipay-root-cert' },
          bank: { description: 'bank transfer' }
        }
      }
    }).commercial;

    const payConfig = buildPayConfig(commercial);

    expect(payConfig).toEqual({ wx: true, alipay: true, bank: true });
    expect(hasPayChannel(payConfig)).toBe(true);
  });

  it('stops exposing a channel after its credential is removed', () => {
    const commercial = resolveSystemInstanceConfig({
      commercial: {
        payment: {
          wx: { privateKey: '' },
          alipay: { rootCertContent: '' },
          bank: { description: 'bank transfer' }
        }
      }
    }).commercial;

    const payConfig = buildPayConfig(commercial);

    expect(payConfig).toEqual({ wx: false, alipay: false, bank: true });
    expect(hasPayChannel(payConfig)).toBe(true);
    expect(hasPayChannel({ wx: false, alipay: false, bank: false })).toBe(false);
  });
});
