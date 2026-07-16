import type { OAuthAccountVerificationProvider } from '@fastgpt/global/support/user/account/verification/type';

type OAuthLoginCallbackStore = {
  provider: OAuthAccountVerificationProvider;
  state: string;
  callbackUrl: string;
};

type OAuthCallbackQueryValue = string | string[] | undefined;

export type ResolvedOAuthLoginCallback =
  | {
      provider: 'sso';
      code: string;
      state?: string;
    }
  | {
      provider: Exclude<OAuthAccountVerificationProvider, 'sso'>;
      code: string;
      state: string;
    };

/**
 * 校验 OAuth 回调与发起登录时的本地上下文是否一致。
 * 仅旧 SSO 回调可以缺少 state；任何已返回的 state 都必须精确匹配。
 */
export const resolveOAuthLoginCallback = ({
  loginStore,
  code,
  state,
  currentCallbackUrl
}: {
  loginStore?: OAuthLoginCallbackStore;
  code: OAuthCallbackQueryValue;
  state: OAuthCallbackQueryValue;
  currentCallbackUrl: string;
}): ResolvedOAuthLoginCallback | undefined => {
  if (
    !loginStore ||
    typeof code !== 'string' ||
    code.length === 0 ||
    loginStore.callbackUrl !== currentCallbackUrl
  ) {
    return;
  }

  if (loginStore.provider === 'sso') {
    if (state === undefined) {
      return { provider: 'sso', code };
    }
    if (typeof state !== 'string' || state !== loginStore.state) {
      return;
    }
    return { provider: 'sso', code, state };
  }

  if (typeof state !== 'string' || state !== loginStore.state) {
    return;
  }

  return {
    provider: loginStore.provider,
    code,
    state
  };
};
