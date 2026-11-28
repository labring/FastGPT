import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import {
  LAST_LOGIN_METHOD_STORAGE_KEY,
  getLastLoginMethodByOAuthProvider,
  getLastLoginMethodByPageType,
  getLoginMethodItems,
  readLastLoginMethod,
  resolveAutoLoginProvider,
  resolveInitialLoginPageType,
  saveLastLoginMethod
} from '@/web/support/user/login/utils';

const labels = {
  wechat: 'WeChat',
  code: 'Verification Code',
  password: 'Password',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft'
};

type ClientFeConfigs = NonNullable<GetSystemInitDataResponse['feConfigs']>;

const createFeConfigs = (overrides: ClientFeConfigs = {}): ClientFeConfigs => ({
  limit: { uploadFileMaxAmount: 10, uploadFileMaxSize: 10 },
  ...overrides
});

describe('resolveInitialLoginPageType', () => {
  it('keeps the root maintenance entry on password login', () => {
    expect(
      resolveInitialLoginPageType({
        rootLogin: true,
        sso: { disablePasswordForSsoUsers: true }
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
  });

  it('shows method selection when SSO is available and its password policy is enabled', () => {
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        sso: { enabled: true, disablePasswordForSsoUsers: true }
      })
    ).toBe(LoginPageTypeEnum.methodSelection);
  });

  it('uses password login when SSO is unavailable even if the saved policy is enabled', () => {
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        sso: { disablePasswordForSsoUsers: true }
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
  });

  it('uses password login when the SSO password policy is disabled', () => {
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        sso: { enabled: true, disablePasswordForSsoUsers: false }
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
  });

  it('prefers verification-code login when enabled unless rootLogin, auto-login credentials, or SSO policy take precedence', () => {
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: true
      })
    ).toBe(LoginPageTypeEnum.codeLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: true,
        codeLoginEnabled: true
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        hasAutoLoginCredentials: true,
        codeLoginEnabled: true
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        sso: { enabled: true, disablePasswordForSsoUsers: true },
        codeLoginEnabled: true
      })
    ).toBe(LoginPageTypeEnum.methodSelection);
  });

  it('restores the last login method when it is still available and falls back to default when unavailable', () => {
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: true,
        lastLoginMethod: 'page:password'
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);

    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: true,
        wechatEnabled: true,
        lastLoginMethod: 'page:wechat'
      })
    ).toBe(LoginPageTypeEnum.wechat);

    // 微信登录被关闭后，不再在可选项内，回退到默认（开启验证码登录时为 codeLogin，否则为 passwordLogin）
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: true,
        wechatEnabled: false,
        lastLoginMethod: 'page:wechat'
      })
    ).toBe(LoginPageTypeEnum.codeLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: false,
        wechatEnabled: false,
        lastLoginMethod: 'page:wechat'
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);

    // 验证码登录被关闭后，回退到默认密码登录
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: false,
        lastLoginMethod: 'page:code'
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);

    // 外跳 OAuth 不自动跳转，回退到当前默认表单页
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: true,
        lastLoginMethod: 'oauth:github'
      })
    ).toBe(LoginPageTypeEnum.codeLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        codeLoginEnabled: false,
        lastLoginMethod: 'oauth:sso'
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);

    // 运维入口、自动凭据与 SSO 禁用密码策略优先级高于上次登录方式
    expect(
      resolveInitialLoginPageType({
        rootLogin: true,
        codeLoginEnabled: true,
        wechatEnabled: true,
        lastLoginMethod: 'page:wechat'
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        hasAutoLoginCredentials: true,
        codeLoginEnabled: true,
        wechatEnabled: true,
        lastLoginMethod: 'page:wechat'
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
    expect(
      resolveInitialLoginPageType({
        rootLogin: false,
        sso: { enabled: true, disablePasswordForSsoUsers: true },
        codeLoginEnabled: true,
        lastLoginMethod: 'page:password'
      })
    ).toBe(LoginPageTypeEnum.methodSelection);
  });
});

describe('last login method storage helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps login page types and OAuth providers to canonical method ids', () => {
    expect(getLastLoginMethodByPageType(LoginPageTypeEnum.codeLogin)).toBe('page:code');
    expect(getLastLoginMethodByPageType(LoginPageTypeEnum.passwordLogin)).toBe('page:password');
    expect(getLastLoginMethodByPageType(LoginPageTypeEnum.forgetPassword)).toBe('page:password');
    expect(getLastLoginMethodByPageType(LoginPageTypeEnum.wechat)).toBe('page:wechat');
    expect(getLastLoginMethodByPageType(LoginPageTypeEnum.methodSelection)).toBeUndefined();

    expect(getLastLoginMethodByOAuthProvider('github')).toBe('oauth:github');
    expect(getLastLoginMethodByOAuthProvider('sso')).toBe('oauth:sso');
    expect(getLastLoginMethodByOAuthProvider('wechat')).toBe('page:wechat');
    expect(getLastLoginMethodByOAuthProvider('unknown')).toBeUndefined();
  });

  it('reads and writes localStorage safely and ignores invalid values or storage errors', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value)
      }
    });

    expect(readLastLoginMethod()).toBeUndefined();
    saveLastLoginMethod('page:password');
    expect(store.get(LAST_LOGIN_METHOD_STORAGE_KEY)).toBe('page:password');
    expect(readLastLoginMethod()).toBe('page:password');

    store.set(LAST_LOGIN_METHOD_STORAGE_KEY, 'invalid-method');
    expect(readLastLoginMethod()).toBeUndefined();

    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('storage blocked');
        },
        setItem: () => {
          throw new Error('storage blocked');
        }
      }
    });
    expect(readLastLoginMethod()).toBeUndefined();
    expect(() => saveLastLoginMethod('page:code')).not.toThrow();
  });
});

describe('resolveAutoLoginProvider', () => {
  it('preserves global SSO automatic login and the root login override outside WeCom', () => {
    const input = {
      ssoAvailable: true,
      ssoAutoLogin: true,
      wecomAvailable: false,
      isWecomTerminal: false,
      wecomLoginAutoRedirect: false
    };

    expect(resolveAutoLoginProvider({ ...input, rootLogin: false })).toBe('sso');
    expect(resolveAutoLoginProvider({ ...input, rootLogin: true })).toBeUndefined();
    expect(
      resolveAutoLoginProvider({ ...input, rootLogin: false, hasAutoLoginCredentials: true })
    ).toBeUndefined();
  });

  it('redirects to WeCom OAuth when both switches are enabled and WeCom OAuth is configured', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: true,
        wecomAvailable: true,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: true
      })
    ).toBe('wecom');
  });

  it('redirects to SSO in WeCom terminal when both switches are enabled and only SSO is configured (self-hosted WeCom SSO)', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: true,
        wecomAvailable: false,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: true
      })
    ).toBe('sso');
  });

  it('skips WeCom OAuth and redirects to third-party SSO when sso.autoLogin is on and wecomLoginAutoRedirect is off', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: true,
        wecomAvailable: true,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: false
      })
    ).toBe('sso');
  });

  it('redirects to WeCom OAuth in SaaS scenario when sso.autoLogin is off and wecomLoginAutoRedirect is on', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: false,
        wecomAvailable: true,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: true
      })
    ).toBe('wecom');

    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: false,
        ssoAutoLogin: false,
        wecomAvailable: true,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: true
      })
    ).toBe('wecom');
  });

  it('does not redirect to SSO in WeCom terminal when sso.autoLogin is off even if wecomLoginAutoRedirect is on', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: false,
        wecomAvailable: false,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: true
      })
    ).toBeUndefined();
  });

  it('does not redirect a WeCom terminal when both switches are off', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: false,
        wecomAvailable: true,
        isWecomTerminal: true,
        wecomLoginAutoRedirect: false
      })
    ).toBeUndefined();
  });
});

describe('getLoginMethodItems', () => {
  it('does not show a disabled SSO capability even when display settings are present', () => {
    const methods = getLoginMethodItems({
      mode: 'selection',
      labels,
      feConfigs: { sso: { enabled: false, title: 'Unavailable SSO' } }
    });
    expect(methods.map(({ id }) => id)).toEqual(['page:password']);
  });
  it('renders every enabled provider in product order and keeps password last', () => {
    const methods = getLoginMethodItems({
      mode: 'selection',
      pageType: LoginPageTypeEnum.methodSelection,
      labels,
      feConfigs: createFeConfigs({
        sso: { enabled: true, title: 'Company SSO', icon: '/sso.png' },
        oauth: {
          wechat: 'wechat-app-id',
          wecom: true,
          google: 'google-client-id',
          github: 'github-client-id',
          microsoft: {
            clientId: 'microsoft-client-id'
          }
        }
      })
    });

    expect(methods.map(({ id }) => id)).toEqual([
      'oauth:sso',
      'page:wechat',
      'oauth:google',
      'oauth:github',
      'oauth:microsoft',
      'page:password'
    ]);
    // 企业微信登录只做终端内自动跳转，选择页不提供可点按钮。
    expect(methods.some(({ id }) => id === 'oauth:wecom')).toBe(false);
    expect(methods.at(-1)).toMatchObject({
      type: 'page',
      pageType: LoginPageTypeEnum.passwordLogin
    });
    expect(methods.find(({ id }) => id === 'oauth:sso')).toMatchObject({
      label: 'Company SSO',
      icon: '/sso.png'
    });
    expect(methods.find(({ id }) => id === 'oauth:microsoft')).toMatchObject({
      // 微软登录不再支持自定义按钮名，文案统一走系统默认。
      label: labels.microsoft
    });
  });

  it('uses the SSO title fallback and filters the current alternative page', () => {
    const methods = getLoginMethodItems({
      mode: 'alternatives',
      pageType: LoginPageTypeEnum.wechat,
      labels,
      feConfigs: createFeConfigs({
        sso: { enabled: true },
        oauth: {
          wechat: 'wechat-app-id',
          wecom: true,
          google: 'google-client-id'
        }
      })
    });

    expect(methods.map(({ id }) => id)).toEqual(['oauth:sso', 'page:password', 'oauth:google']);
    expect(methods[0]).toMatchObject({ label: 'SSO' });
  });

  it('shows password login under verification-code login and vice versa when code login is enabled', () => {
    const feConfigs = createFeConfigs({
      isPlus: true,
      login_method: ['email', 'phone'],
      oauth: { github: 'github-client-id' }
    });

    const onCodePage = getLoginMethodItems({
      mode: 'alternatives',
      pageType: LoginPageTypeEnum.codeLogin,
      labels,
      feConfigs
    });
    expect(onCodePage.map(({ id }) => id)).toEqual(['page:password', 'oauth:github']);

    const onPasswordPage = getLoginMethodItems({
      mode: 'alternatives',
      pageType: LoginPageTypeEnum.passwordLogin,
      labels,
      feConfigs
    });
    expect(onPasswordPage.map(({ id }) => id)).toEqual(['page:code', 'oauth:github']);

    const onSelectionPage = getLoginMethodItems({
      mode: 'selection',
      pageType: LoginPageTypeEnum.methodSelection,
      labels,
      feConfigs
    });
    expect(onSelectionPage.map(({ id }) => id)).toEqual([
      'page:code',
      'oauth:github',
      'page:password'
    ]);
  });
});
