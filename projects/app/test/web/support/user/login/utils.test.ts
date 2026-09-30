import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import { describe, expect, it } from 'vitest';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import {
  getLoginMethodItems,
  resolveAutoLoginProvider,
  resolveInitialLoginPageType
} from '@/web/support/user/login/utils';

const labels = {
  wechat: 'WeChat',
  password: 'Password',
  google: 'Google',
  github: 'GitHub',
  microsoft: 'Microsoft'
};

const createFeConfigs = (overrides: Partial<FastGPTFeConfigsType> = {}): FastGPTFeConfigsType => ({
  uploadFileMaxAmount: 10,
  uploadFileMaxSize: 10,
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
        sso: { url: 'https://sso.example.com', disablePasswordForSsoUsers: true }
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
        sso: { url: 'https://sso.example.com', disablePasswordForSsoUsers: false }
      })
    ).toBe(LoginPageTypeEnum.passwordLogin);
  });
});

describe('resolveAutoLoginProvider', () => {
  it('preserves SSO automatic login and the root login override', () => {
    const input = {
      ssoAvailable: true,
      ssoAutoLogin: true,
      wecomAvailable: false,
      isWecomTerminal: false,
      canWecomTerminalAutoRedirect: true
    };

    expect(resolveAutoLoginProvider({ ...input, rootLogin: false })).toBe('sso');
    expect(resolveAutoLoginProvider({ ...input, rootLogin: true })).toBeUndefined();
  });

  it('falls back to WeCom on its terminal when SSO is unavailable', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: false,
        ssoAutoLogin: false,
        wecomAvailable: true,
        isWecomTerminal: true,
        canWecomTerminalAutoRedirect: true
      })
    ).toBe('wecom');
  });

  it('does not redirect a WeCom terminal when terminal redirects are disabled', () => {
    expect(
      resolveAutoLoginProvider({
        rootLogin: false,
        ssoAvailable: true,
        ssoAutoLogin: false,
        wecomAvailable: true,
        isWecomTerminal: true,
        canWecomTerminalAutoRedirect: false
      })
    ).toBeUndefined();
  });
});

describe('getLoginMethodItems', () => {
  it('renders every enabled provider in product order and keeps password last', () => {
    const methods = getLoginMethodItems({
      mode: 'selection',
      pageType: LoginPageTypeEnum.methodSelection,
      labels,
      feConfigs: createFeConfigs({
        sso: { url: 'https://sso.example.com', title: 'Company SSO', icon: '/sso.png' },
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
        sso: { url: 'https://sso.example.com' },
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
});
