import { resolveAccountVerificationByUsername } from '../verification/utils';
import type { AccountCancellationResolveResult, AccountCancellationResolverInput } from './type';

/** 将统一 resolver 的结果收窄为注销允许的非密码验证方式。 */
export const resolveAccountCancellationByUsername = ({
  username,
  capabilities
}: AccountCancellationResolverInput): AccountCancellationResolveResult => {
  const result = resolveAccountVerificationByUsername({
    username: username ?? '',
    capabilities
  });

  if (result.status === 'unsupported') return result;

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
