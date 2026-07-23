import { resolveAccountVerificationByUsername } from '../verification/utils';
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

  const result = resolveAccountVerificationByUsername({
    username: account,
    capabilities,
    allowPasswordFallback: false
  });
  if (result.status === 'unsupported' || result.method === 'oldPassword') {
    return {
      status: 'unsupported',
      accountKind: result.accountKind,
      unsupportedReason: 'verification_unavailable'
    };
  }

  return {
    status: 'supported',
    accountKind: result.accountKind,
    method: result.method
  };
};
