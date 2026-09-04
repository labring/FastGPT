import { resolveAccountVerificationByUsername } from '../verification/utils';
import type { AccountCancellationResolveResult, AccountCancellationResolverInput } from './type';

/** 将统一 resolver 的结果收窄为注销允许的非密码验证方式。 */
export const resolveAccountCancellationByUsername = ({
  username,
  capabilities
}: AccountCancellationResolverInput): AccountCancellationResolveResult => {
  const result = resolveAccountVerificationByUsername({
    username: username ?? '',
    capabilities,
    // 注销不实际使用密码；这里保留 fallback 仅用于将该分类收窄为既有注销错误。
    allowPasswordFallback: true,
    oldPasswordAvailable: true
  });

  if (result.status === 'unsupported') {
    return {
      status: 'unsupported',
      accountKind: result.accountKind,
      unsupportedReason:
        result.unsupportedReason === 'empty_username'
          ? 'empty_username'
          : 'verification_unavailable'
    };
  }

  if (result.method === 'oldPassword') {
    return {
      status: 'unsupported',
      accountKind: result.accountKind,
      unsupportedReason: 'password_verification_not_allowed'
    };
  }

  return {
    status: 'supported',
    accountKind: result.accountKind,
    method: result.method
  };
};
