import { resolveAccountVerificationByUsername } from '../verification/utils';
import { AccountVerificationMethodEnum } from '../verification/constants';
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

  const result = resolveAccountVerificationByUsername({ username: account, capabilities });
  if (result.status === 'unsupported') {
    return {
      status: 'unsupported',
      accountKind: result.accountKind,
      unsupportedReason: 'verification_unavailable'
    };
  }

  if (result.method === AccountVerificationMethodEnum.oldPassword) {
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
