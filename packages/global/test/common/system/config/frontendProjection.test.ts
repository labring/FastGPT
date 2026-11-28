import { describe, expect, it } from 'vitest';
import {
  buildAuthMethodProjection,
  buildLoginMethods,
  buildOauthFeConfig,
  buildPayConfig,
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

describe('buildLoginMethods', () => {
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

  it('derives login methods from email switch and SMS login template without falling back to deprecated register template', () => {
    expect(buildLoginMethods({ auth: createAuth({}) })).toEqual([]);
    expect(
      buildLoginMethods({ auth: createAuth({ loginProviders: { email: { register: true } } }) })
    ).toEqual(['email']);
    expect(
      buildLoginMethods({
        auth: createAuth({
          loginProviders: {
            phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' }
          }
        })
      })
    ).toEqual([]);
    expect(
      buildLoginMethods({
        auth: createAuth({
          loginProviders: {
            sms: { login: { zh: 'LOGIN' } }
          }
        })
      })
    ).toEqual([]);
    expect(
      buildLoginMethods({
        auth: createAuth({
          loginProviders: {
            phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' },
            sms: { register: { zh: 'REGISTER' } }
          }
        })
      })
    ).toEqual([]);
    expect(
      buildLoginMethods({
        auth: createAuth({
          loginProviders: {
            phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' },
            sms: { login: { zh: 'LOGIN' } }
          }
        })
      })
    ).toEqual(['phone']);
    expect(buildLoginMethods({ auth: phoneReadyAuth })).toEqual(['email', 'phone']);
  });

  it('derives login, find-password and bind-notification methods', () => {
    expect(buildAuthMethodProjection({ auth: phoneReadyAuth })).toEqual({
      login_method: ['email', 'phone'],
      find_password_method: ['email', 'phone'],
      bind_notification_method: ['email', 'phone']
    });

    const registerOnlyAuth = createAuth({
      loginProviders: {
        phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' },
        sms: { login: { zh: '' }, register: { zh: 'REGISTER' } }
      }
    });
    expect(buildAuthMethodProjection({ auth: registerOnlyAuth }).login_method).toEqual([]);

    const loginOnlyAuth = createAuth({
      loginProviders: {
        phone: { accessKeyId: 'ak', accessKeySecret: 'sk', signName: 'sign' },
        sms: { login: { zh: 'LOGIN' }, register: { zh: '' } }
      }
    });
    expect(buildAuthMethodProjection({ auth: loginOnlyAuth }).login_method).toEqual(['phone']);

    expect(buildAuthMethodProjection({ auth: createAuth({}) })).toEqual({
      login_method: [],
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
