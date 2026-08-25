import type { FastGPTFeConfigsType } from '../../../../common/system/types';
import { OAuthEnum } from '../../constant';

export type DirectOAuthProvider = OAuthEnum.github | OAuthEnum.google | OAuthEnum.microsoft;

export type OAuthAuthorizationInteraction = 'login' | 'reauth';

export type OAuthAuthorizationConfig = Partial<
  Pick<NonNullable<FastGPTFeConfigsType['oauth']>, 'github' | 'google' | 'microsoft'>
>;

export type CreateAuthorizationUrlParams = {
  provider: DirectOAuthProvider;
  redirectUri: string;
  state: string;
  interaction: OAuthAuthorizationInteraction;
  config?: OAuthAuthorizationConfig;
};

/**
 * 构造 GitHub、Google、Microsoft 的 OAuth 授权地址。
 *
 * 登录和重新认证必须共用参数、编码和 Provider 配置；interaction 只表达场景差异，
 * 重新认证时对支持该参数的 Provider 要求重新认证或重新选择账号。
 */
export const createAuthorizationUrl = ({
  provider,
  redirectUri,
  state,
  interaction,
  config
}: CreateAuthorizationUrlParams) => {
  const url = (() => {
    if (provider === OAuthEnum.github) {
      const clientId = config?.github;
      if (!clientId) throw new Error('GitHub OAuth is not configured');

      const result = new URL('https://github.com/login/oauth/authorize');
      result.searchParams.set('client_id', clientId);
      result.searchParams.set('scope', 'user:email read:user');
      return result;
    }

    if (provider === OAuthEnum.google) {
      const clientId = config?.google;
      if (!clientId) throw new Error('Google OAuth is not configured');

      const result = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      result.searchParams.set('client_id', clientId);
      result.searchParams.set('response_type', 'code');
      result.searchParams.set(
        'scope',
        'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email openid'
      );
      result.searchParams.set('include_granted_scopes', 'true');
      if (interaction === 'reauth') result.searchParams.set('prompt', 'select_account');
      return result;
    }

    const microsoft = config?.microsoft;
    if (!microsoft?.clientId) throw new Error('Microsoft OAuth is not configured');

    const result = new URL(
      `https://login.microsoftonline.com/${microsoft.tenantId ?? 'common'}/oauth2/v2.0/authorize`
    );
    result.searchParams.set('client_id', microsoft.clientId);
    result.searchParams.set('response_type', 'code');
    result.searchParams.set('response_mode', 'query');
    result.searchParams.set('scope', 'https://graph.microsoft.com/user.read');
    if (interaction === 'reauth') result.searchParams.set('prompt', 'login');
    return result;
  })();

  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  return url.toString();
};
