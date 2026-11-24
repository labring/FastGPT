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
      /** 多 SSO 来源：同 provider 下的实例 ID（企微多企业/多个 OAuth2 IdP） */
      source?: string;
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

/**
 * 按既有渠道顺序生成可见登录方式，选择页始终将密码登录追加到末尾。
 * 企业微信登录只保留终端内自动跳转，不在选择页提供可点按钮，与旧实现保持一致。
 */
export const getLoginMethodItems = ({
  mode,
  pageType,
  feConfigs,
  labels,
  ssoSources = []
}: {
  mode: 'selection' | 'alternatives';
  pageType?: `${LoginPageTypeEnum}`;
  feConfigs: Pick<NonNullable<GetSystemInitDataResponse['feConfigs']>, 'sso' | 'oauth'>;
  labels: LoginMethodLabels;
  /** sso 服务返回的登录来源列表；多来源时按来源展开多个按钮，单来源/为空保持单按钮 */
  ssoSources?: Array<{ id: string; provider: string; name: string; source: string }>;
}): LoginMethodItem[] => {
  const result: LoginMethodItem[] = [];

  if (feConfigs.sso?.enabled) {
    if (ssoSources.length > 1) {
      // 多来源：每个来源一个入口，label 用来源名（来自 sso 服务 env，不需要 i18n）
      for (const source of ssoSources) {
        result.push({
          id: `oauth:sso:${source.source}`,
          type: 'oauth',
          provider: 'sso',
          label: source.name,
          source: source.source
        });
      }
    } else {
      result.push({
        id: 'oauth:sso',
        type: 'oauth',
        provider: 'sso',
        label: feConfigs.sso.title || 'SSO',
        icon: feConfigs.sso.icon
      });
    }
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
