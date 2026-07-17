import { describe, expect, it } from 'vitest';
import type { AccountVerificationCapabilities } from '@fastgpt/global/support/user/account/verification/type';
import { resolveAccountCancellationByUsername } from '@fastgpt/global/support/user/account/cancellation/resolver';

const capabilities: AccountVerificationCapabilities = {
  emailCode: true,
  phoneCode: true,
  wechat: true,
  oauth: {
    github: true,
    google: true,
    microsoft: true,
    wecom: true,
    sso: true
  }
};

describe('resolveAccountCancellationByUsername', () => {
  it('allows the shared non-password resolver result', () => {
    expect(
      resolveAccountCancellationByUsername({
        username: 'user@example.com',
        capabilities
      })
    ).toEqual({ status: 'supported', accountKind: 'email', method: 'code' });
  });

  it('turns the shared old-password fallback into an unsupported result', () => {
    expect(
      resolveAccountCancellationByUsername({
        username: 'local',
        capabilities
      })
    ).toEqual({
      status: 'unsupported',
      accountKind: 'local',
      unsupportedReason: 'password_verification_not_allowed'
    });
  });

  it('does not expose a provider that is unavailable', () => {
    expect(
      resolveAccountCancellationByUsername({
        username: 'git-octocat',
        capabilities: {
          ...capabilities,
          oauth: { ...capabilities.oauth, github: false }
        }
      })
    ).toMatchObject({
      status: 'unsupported',
      accountKind: 'github',
      unsupportedReason: 'password_verification_not_allowed'
    });
  });
});
