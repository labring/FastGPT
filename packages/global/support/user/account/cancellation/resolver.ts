import { resolveAccountVerificationByUsername } from '../verification/utils';
import type { AccountVerificationCapabilities } from '../verification/type';
import type {
  AccountCancellationAllowedMethod,
  AccountCancellationResolveResult,
  AccountCancellationResolverInput
} from './type';

/**
 * 将统一 resolver 的结果收窄为注销允许的非密码验证方式。
 *
 * 注销场景禁止走旧密码降级，因此以 `allowPasswordFallback: false` 调用通用 resolver，
 * 并把它的失败原因映射回注销语义（`no_available_verification_method` → `password_verification_not_allowed`）。
 * 由于禁用了密码降级，返回的 method 永远不会是 `oldPassword`，可安全收窄为注销允许的方法集合。
 */
export const resolveAccountCancellationByUsername = ({
  username,
  capabilities
}: AccountCancellationResolverInput): AccountCancellationResolveResult => {
  const normalizedAccount = (username ?? '').trim();
  if (!normalizedAccount) {
    return {
      status: 'unsupported',
      accountKind: 'invalid',
      unsupportedReason: 'empty_username'
    };
  }

  const resolved = resolveAccountVerificationByUsername({
    username: normalizedAccount,
    capabilities: capabilities as AccountVerificationCapabilities,
    allowPasswordFallback: false
  });

  if (resolved.status === 'supported') {
    return {
      status: 'supported',
      accountKind: resolved.accountKind,
      // allowPasswordFallback: false 保证不会返回 oldPassword，故可安全收窄为注销允许的方法。
      method: resolved.method as AccountCancellationAllowedMethod
    };
  }

  return {
    status: 'unsupported',
    accountKind: resolved.accountKind,
    unsupportedReason: 'password_verification_not_allowed'
  };
};
