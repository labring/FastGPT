import { describe, expect, it } from 'vitest';
import { resolveAccountCancellationAccess } from '@fastgpt/service/support/user/account/cancellation/access';

describe('resolveAccountCancellationAccess', () => {
  it.each([
    {
      method: 'GET',
      url: '/api/proApi/support/user/account/cancellation/status',
      expected: true
    },
    {
      method: 'DELETE',
      url: '/api/proApi/support/user/account/cancellation/cancel',
      expected: true
    },
    {
      method: 'POST',
      url: '/api/proApi/support/user/account/cancellation/verification/create',
      expected: false
    },
    {
      method: 'POST',
      url: '/api/proApi/support/user/account/cancellation/submit',
      expected: false
    }
  ])('resolves current-session team access for $method $url', ({ method, url, expected }) => {
    const result = resolveAccountCancellationAccess({
      req: { method, url },
      accountCancellationAccess: 'selfCancellation'
    });

    expect(result.allowCurrentSessionTeamAccountCancellationPending).toBe(expected);
  });
});
