import { AccountEmailUsernameSchema, AccountPhoneUsernameSchema } from '../verification/type';
import type { AccountCancellationResolveResult, AccountCancellationResolverInput } from './type';

/** 将统一 resolver 的结果收窄为注销允许的非密码验证方式。 */
export const resolveAccountCancellationByUsername = ({
  username,
  capabilities
}: AccountCancellationResolverInput): AccountCancellationResolveResult => {
  const account = username ?? '';
  if (!account.trim()) {
    return {
      status: 'unsupported',
      accountKind: 'invalid',
      unsupportedReason: 'empty_username'
    };
  }

  const normalizedAccount = account.trim();
  const hasPrefix = (prefix: string) =>
    normalizedAccount.startsWith(`${prefix}-`) && normalizedAccount.length > prefix.length + 1;
  const firstSeparatorIndex = normalizedAccount.indexOf('-');
  const hasSsoPrefix =
    firstSeparatorIndex > 0 && firstSeparatorIndex < normalizedAccount.length - 1;
  const accountKind = (() => {
    if (AccountEmailUsernameSchema.safeParse(normalizedAccount).success) return 'email';
    if (AccountPhoneUsernameSchema.safeParse(normalizedAccount).success) return 'phone';
    if (hasPrefix('wechat')) return 'wechat';
    if (hasPrefix('git')) return 'github';
    if (hasPrefix('google')) return 'google';
    if (hasPrefix('microsoft')) return 'microsoft';
    if (hasPrefix('wecom')) return 'wecom';
    if (capabilities.oauth.sso && hasSsoPrefix) return 'sso';
    return 'local';
  })();

  const method = (() => {
    if (accountKind === 'email' && capabilities.emailCode) return 'code';
    if (accountKind === 'phone' && capabilities.phoneCode) return 'code';
    if (accountKind === 'wechat' && capabilities.wechat) return 'wechat';
    if (accountKind === 'github' && capabilities.oauth.github) return 'oauth/github';
    if (accountKind === 'google' && capabilities.oauth.google) return 'oauth/google';
    if (accountKind === 'microsoft' && capabilities.oauth.microsoft) return 'oauth/microsoft';
    if (accountKind === 'wecom' && capabilities.oauth.sso) return 'oauth/sso';
    if (accountKind === 'wecom' && capabilities.oauth.wecom) return 'oauth/wecom';
    if (accountKind === 'sso' && capabilities.oauth.sso) return 'oauth/sso';
    return undefined;
  })();

  if (!method) {
    return {
      status: 'unsupported',
      accountKind,
      unsupportedReason: 'password_verification_not_allowed'
    };
  }

  return {
    status: 'supported',
    accountKind,
    method
  };
};
