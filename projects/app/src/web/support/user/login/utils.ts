import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import { oauthAccountVerificationProviders } from '@fastgpt/global/support/user/account/verification/constants';
import type { OAuthAccountVerificationProvider } from '@fastgpt/global/support/user/account/verification/type';
import { OAuthEnum } from '@fastgpt/global/support/user/constant';
import {
  isSsoPasswordPolicyEnabled,
  type SsoPasswordPolicyConfig
} from '@fastgpt/global/support/user/account/password/utils';
import { getLoginMethods } from '@/web/common/system/utils';
import { LoginPageTypeEnum } from './constants';

export const LAST_LOGIN_METHOD_STORAGE_KEY = 'fastgpt_last_login_method';

export type RestorableLoginPageType =
  | LoginPageTypeEnum.codeLogin
  | LoginPageTypeEnum.passwordLogin
  | LoginPageTypeEnum.wechat;

export type LastLoginMethod =
  | 'page:code'
  | 'page:password'
  | 'page:wechat'
  | `oauth:${OAuthAccountVerificationProvider}`;

const lastLoginMethodPageMap: Record<
  'page:code' | 'page:password' | 'page:wechat',
  RestorableLoginPageType
> = {
  'page:code': LoginPageTypeEnum.codeLogin,
  'page:password': LoginPageTypeEnum.passwordLogin,
  'page:wechat': LoginPageTypeEnum.wechat
};

const validLastLoginMethods = new Set<string>([
  'page:code',
  'page:password',
  'page:wechat',
  ...oauthAccountVerificationProviders.map((provider) => `oauth:${provider}`)
]);

export type LoginMethodItem =
  | {
      id: string;
      type: 'page';
      pageType: RestorableLoginPageType;
      label: string;
      icon: string;
    }
  | {
      id: string;
      type: 'oauth';
      provider: OAuthAccountVerificationProvider;
      label: string;
      icon?: string;
    };

type LoginMethodLabels = {
  wechat: string;
  code: string;
  password: string;
  google: string;
  github: string;
  microsoft: string;
};

/** 将登录页表单类型映射为可持久化的登录方式标识；找回密码并登录后归类为密码登录。 */
export const getLastLoginMethodByPageType = (
  pageType?: `${LoginPageTypeEnum}`
): LastLoginMethod | undefined => {
  switch (pageType) {
    case LoginPageTypeEnum.codeLogin:
      return 'page:code';
    case LoginPageTypeEnum.passwordLogin:
    case LoginPageTypeEnum.forgetPassword:
      return 'page:password';
    case LoginPageTypeEnum.wechat:
      return 'page:wechat';
    default:
      return undefined;
  }
};

/** 将 OAuth 回调 Provider 映射为统一登录方式标识，避免遗留旧的站内表单偏好。 */
export const getLastLoginMethodByOAuthProvider = (
  provider?: string
): LastLoginMethod | undefined => {
  if (!provider) return undefined;
  if (provider === OAuthEnum.wechat) return 'page:wechat';
  const candidate = `oauth:${provider}`;
  return validLastLoginMethods.has(candidate) ? (candidate as LastLoginMethod) : undefined;
};

/** 从浏览器本地读取上次登录方式；SSR、禁用存储或非法脏值均安全回退为 undefined。 */
export const readLastLoginMethod = (): LastLoginMethod | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(LAST_LOGIN_METHOD_STORAGE_KEY);
    return raw && validLastLoginMethods.has(raw) ? (raw as LastLoginMethod) : undefined;
  } catch {
    return undefined;
  }
};

/** 在登录成功后记录本次登录方式；存储不可用时静默忽略，不阻断登录主流程。 */
export const saveLastLoginMethod = (method?: LastLoginMethod): void => {
  if (!method || typeof window === 'undefined' || !validLastLoginMethods.has(method)) return;
  try {
    window.localStorage.setItem(LAST_LOGIN_METHOD_STORAGE_KEY, method);
  } catch {
    // 隐私模式或禁用存储时忽略写入失败，避免影响登录跳转。
  }
};

/**
 * 根据运维入口、自动登录凭据、SSO 密码策略、上次登录方式与验证码登录能力计算登录页的首个可见状态。
 * 优先级：rootLogin / 自动登录凭据 > SSO 禁止密码策略选择页 > 仍可用的上次登录方式 > 验证码登录 > 密码登录。
 */
export const resolveInitialLoginPageType = ({
  rootLogin,
  hasAutoLoginCredentials = false,
  sso,
  codeLoginEnabled = false,
  wechatEnabled = false,
  lastLoginMethod
}: {
  rootLogin: boolean;
  hasAutoLoginCredentials?: boolean;
  sso?: SsoPasswordPolicyConfig;
  codeLoginEnabled?: boolean;
  wechatEnabled?: boolean;
  lastLoginMethod?: LastLoginMethod;
}): LoginPageTypeEnum => {
  if (rootLogin || hasAutoLoginCredentials) return LoginPageTypeEnum.passwordLogin;
  if (isSsoPasswordPolicyEnabled(sso)) return LoginPageTypeEnum.methodSelection;

  const availablePageTypes: RestorableLoginPageType[] = [LoginPageTypeEnum.passwordLogin];
  if (codeLoginEnabled) availablePageTypes.push(LoginPageTypeEnum.codeLogin);
  if (wechatEnabled) availablePageTypes.push(LoginPageTypeEnum.wechat);

  // 仅当上次登录方式对应站内表单且当前配置仍可用时恢复；外跳 OAuth 不自动跳转，避免登出后陷入循环。
  const restorablePageType =
    lastLoginMethod && lastLoginMethod in lastLoginMethodPageMap
      ? lastLoginMethodPageMap[lastLoginMethod as keyof typeof lastLoginMethodPageMap]
      : undefined;
  if (restorablePageType && availablePageTypes.includes(restorablePageType)) {
    return restorablePageType;
  }

  if (codeLoginEnabled) return LoginPageTypeEnum.codeLogin;
  return LoginPageTypeEnum.passwordLogin;
};

/**
 * Resolve the automatic login provider by priority without probing the SSO provider type:
 * 1. rootLogin maintenance entry and query auto-login credentials (?u=&p=) never auto-redirect.
 * 2. In a WeCom terminal with wecomLoginAutoRedirect enabled, redirect to WeCom OAuth when
 *    configured (covers SaaS WeCom and prioritizes WeCom over third-party SSO).
 * 3. When global sso.autoLogin is enabled and SSO is available, redirect to SSO across all
 *    terminals (in WeCom terminal with wecomLoginAutoRedirect=true, self-hosted WeCom SSO
 *    redirects to WeCom OAuth; with wecomLoginAutoRedirect=false, falls through to SSO).
 * Callers must keep the page in a loading state when a provider is returned to avoid flashing.
 */
export const resolveAutoLoginProvider = ({
  rootLogin,
  hasAutoLoginCredentials = false,
  ssoAvailable,
  ssoAutoLogin,
  wecomAvailable,
  isWecomTerminal,
  wecomLoginAutoRedirect
}: {
  rootLogin: boolean;
  hasAutoLoginCredentials?: boolean;
  ssoAvailable: boolean;
  ssoAutoLogin: boolean;
  wecomAvailable: boolean;
  isWecomTerminal: boolean;
  wecomLoginAutoRedirect: boolean;
}): 'sso' | 'wecom' | undefined => {
  if (rootLogin || hasAutoLoginCredentials) return;
  if (isWecomTerminal && wecomLoginAutoRedirect && wecomAvailable) return 'wecom';
  if (ssoAvailable && ssoAutoLogin) return 'sso';
};

/**
 * 按既有渠道顺序生成可见登录方式，选择页始终将密码登录追加到末尾。
 * 企业微信登录只保留终端内自动跳转，不在选择页提供可点按钮，与旧实现保持一致。
 */
export const getLoginMethodItems = ({
  mode,
  pageType,
  feConfigs,
  labels
}: {
  mode: 'selection' | 'alternatives';
  pageType?: `${LoginPageTypeEnum}`;
  feConfigs: Pick<
    NonNullable<GetSystemInitDataResponse['feConfigs']>,
    'sso' | 'oauth' | 'login_method' | 'teamMode' | 'isPlus'
  >;
  labels: LoginMethodLabels;
}): LoginMethodItem[] => {
  const result: LoginMethodItem[] = [];
  const codeLoginEnabled = getLoginMethods(feConfigs).length > 0;

  if (feConfigs.sso?.enabled) {
    result.push({
      id: 'oauth:sso',
      type: 'oauth',
      provider: 'sso',
      label: feConfigs.sso.title || 'SSO',
      icon: feConfigs.sso.icon
    });
  }

  if (feConfigs.oauth?.wechat && pageType !== LoginPageTypeEnum.wechat) {
    result.push({
      id: 'page:wechat',
      type: 'page',
      pageType: LoginPageTypeEnum.wechat,
      label: labels.wechat,
      icon: 'common/wechatFill'
    });
  }

  if (codeLoginEnabled && pageType !== LoginPageTypeEnum.codeLogin) {
    result.push({
      id: 'page:code',
      type: 'page',
      pageType: LoginPageTypeEnum.codeLogin,
      label: labels.code,
      icon: 'key'
    });
  }

  if (mode === 'alternatives' && pageType !== LoginPageTypeEnum.passwordLogin) {
    result.push({
      id: 'page:password',
      type: 'page',
      pageType: LoginPageTypeEnum.passwordLogin,
      label: labels.password,
      icon: 'support/permission/privateLight'
    });
  }

  if (feConfigs.oauth?.google) {
    result.push({
      id: 'oauth:google',
      type: 'oauth',
      provider: 'google',
      label: labels.google,
      icon: 'common/googleFill'
    });
  }

  if (feConfigs.oauth?.github) {
    result.push({
      id: 'oauth:github',
      type: 'oauth',
      provider: 'github',
      label: labels.github,
      icon: 'common/gitFill'
    });
  }

  if (feConfigs.oauth?.microsoft) {
    result.push({
      id: 'oauth:microsoft',
      type: 'oauth',
      provider: 'microsoft',
      label: labels.microsoft,
      icon: 'common/microsoft'
    });
  }

  if (mode === 'selection') {
    result.push({
      id: 'page:password',
      type: 'page',
      pageType: LoginPageTypeEnum.passwordLogin,
      label: labels.password,
      icon: 'support/user/userFill'
    });
  }

  return result;
};
