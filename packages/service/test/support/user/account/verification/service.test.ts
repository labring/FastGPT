import { describe, expect, it } from 'vitest';
import { assertExternalAccountIdentityMatchesUsername } from '@fastgpt/service/support/user/account/verification/service';

describe('assertExternalAccountIdentityMatchesUsername', () => {
  const ssoIdentity = {
    kind: 'external' as const,
    provider: 'sso' as const,
    subject: 'customer-user',
    username: 'customer-user'
  };

  it('accepts an exact SSO identity match', () => {
    expect(() =>
      assertExternalAccountIdentityMatchesUsername({
        identity: ssoIdentity,
        username: 'customer-user'
      })
    ).not.toThrow();
  });

  it('rejects a code-only SSO identity that does not belong to the current user', () => {
    expect(() =>
      assertExternalAccountIdentityMatchesUsername({
        identity: ssoIdentity,
        username: 'customer-other-user'
      })
    ).toThrow('Verified external identity does not match the current user');
  });
});
