import type { GetSystemInitDataResponse } from '@fastgpt/global/openapi/common/system/api';
import type { OAuthAccountVerificationProvider } from '@fastgpt/global/support/user/account/verification/type';
import {
  isSsoPasswordPolicyEnabled,
  type SsoPasswordPolicyConfig
} from '@fastgpt/global/support/user/account/password/utils';
import { LoginPageTypeEnum } from './constants';

export type LoginMethodItem =
  | {
      id: string;
      type: 'page';
      pageType: LoginPageTypeEnum.passwordLogin | LoginPageTypeEnum.wechat;
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
  password: string;
  google: string;
  github: string;
  microsoft: string;
};

/**
 * 根据运维入口与当前 SSO 密码策略计算登录页的首个可见状态。
 * 策略判定完全交给 global 的 isSsoPasswordPolicyEnabled，与服务端、管理端保持同一口径。
 */
export const resolveInitialLoginPageType = ({
  rootLogin,
  sso
}: {
  rootLogin: boolean;
  sso?: SsoPasswordPolicyConfig;
}): LoginPageTypeEnum => {
  if (rootLogin) return LoginPageTypeEnum.passwordLogin;
  return isSsoPasswordPolicyEnabled(sso)
    ? LoginPageTypeEnum.methodSelection
    : LoginPageTypeEnum.passwordLogin;
};

/**
 * Resolve the automatic login provider by priority without probing the SSO provider type:
 * 1. rootLogin maintenance entry never auto-redirects.
 * 2. In a WeCom terminal with wecomLoginAutoRedirect enabled, redirect to WeCom OAuth when
 *    configured (covers SaaS WeCom and prioritizes WeCom over third-party SSO).
 * 3. When global sso.autoLogin is enabled and SSO is available, redirect to SSO across all
 *    terminals (in WeCom terminal with wecomLoginAutoRedirect=true, self-hosted WeCom SSO
 *    redirects to WeCom OAuth; with wecomLoginAutoRedirect=false, falls through to SSO).
 * Callers must keep the page in a loading state when a provider is returned to avoid flashing.
 */
export const resolveAutoLoginProvider = ({
  rootLogin,
  ssoAvailable,
  ssoAutoLogin,
  wecomAvailable,
  isWecomTerminal,
  wecomLoginAutoRedirect
}: {
  rootLogin: boolean;
  ssoAvailable: boolean;
  ssoAutoLogin: boolean;
  wecomAvailable: boolean;
  isWecomTerminal: boolean;
  wecomLoginAutoRedirect: boolean;
}): 'sso' | 'wecom' | undefined => {
  if (rootLogin) return;
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
  feConfigs: Pick<NonNullable<GetSystemInitDataResponse['feConfigs']>, 'sso' | 'oauth'>;
  labels: LoginMethodLabels;
}): LoginMethodItem[] => {
  const result: LoginMethodItem[] = [];

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
