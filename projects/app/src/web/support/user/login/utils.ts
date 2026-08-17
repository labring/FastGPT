import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { OAuthAccountVerificationProvider } from '@fastgpt/global/support/user/account/verification/type';
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
  wecom: string;
  password: string;
  google: string;
  github: string;
  microsoft: string;
};

/** 根据运维入口与当前 SSO 密码策略计算登录页的首个可见状态。 */
export const resolveInitialLoginPageType = ({
  rootLogin,
  ssoAvailable,
  disablePasswordForSsoUsers
}: {
  rootLogin: boolean;
  ssoAvailable: boolean;
  disablePasswordForSsoUsers: boolean;
}): LoginPageTypeEnum => {
  if (rootLogin) return LoginPageTypeEnum.passwordLogin;
  return ssoAvailable && disablePasswordForSsoUsers
    ? LoginPageTypeEnum.methodSelection
    : LoginPageTypeEnum.passwordLogin;
};

/**
 * 复用既有 SSO/企业微信终端规则计算自动跳转 Provider。
 * 返回 Provider 后调用方需保持页面处于 Loading，避免选择页在跳转前闪现。
 */
export const resolveAutoLoginProvider = ({
  rootLogin,
  ssoAvailable,
  ssoAutoLogin,
  wecomAvailable,
  isWecomTerminal,
  canWecomTerminalAutoRedirect
}: {
  rootLogin: boolean;
  ssoAvailable: boolean;
  ssoAutoLogin: boolean;
  wecomAvailable: boolean;
  isWecomTerminal: boolean;
  canWecomTerminalAutoRedirect: boolean;
}): 'sso' | 'wecom' | undefined => {
  if (rootLogin || !canWecomTerminalAutoRedirect) return;
  if (ssoAvailable && (ssoAutoLogin || isWecomTerminal)) return 'sso';
  if (wecomAvailable && isWecomTerminal) return 'wecom';
};

/** 按既有渠道顺序生成可见登录方式，选择页始终将密码登录追加到末尾。 */
export const getLoginMethodItems = ({
  mode,
  pageType,
  feConfigs,
  labels
}: {
  mode: 'selection' | 'alternatives';
  pageType?: `${LoginPageTypeEnum}`;
  feConfigs: FastGPTFeConfigsType;
  labels: LoginMethodLabels;
}): LoginMethodItem[] => {
  const result: LoginMethodItem[] = [];

  if (feConfigs.sso?.url) {
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

  if (mode === 'selection' && feConfigs.oauth?.wecom) {
    result.push({
      id: 'oauth:wecom',
      type: 'oauth',
      provider: 'wecom',
      label: labels.wecom,
      icon: 'common/wecom'
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
      label: feConfigs.oauth.microsoft.customButton || labels.microsoft,
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
