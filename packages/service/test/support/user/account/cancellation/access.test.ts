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

  it.each([
    '/api/support/user/account/login/tokenLogin',
    '/proApi/support/user/account/login/tokenLogin'
  ])('allows token login route %s', (url) => {
    expect(() =>
      resolveAccountCancellationAccess({
        req: { method: 'GET', url },
        accountCancellationAccess: 'tokenLogin'
      })
    ).not.toThrow();
  });

  it.each([
    { method: 'GET', url: '/proApi/support/user/team/list', allowed: true },
    { method: 'POST', url: '/proApi/support/user/team/switch', allowed: true },
    { method: 'PUT', url: '/proApi/support/user/team/switch', allowed: true },
    { method: 'DELETE', url: '/proApi/support/user/team/member/leave', allowed: false }
  ])('keeps teamEscape exact route scope for $method $url', ({ method, url, allowed }) => {
    const run = () =>
      resolveAccountCancellationAccess({
        req: { method, url },
        accountCancellationAccess: 'teamEscape'
      });

    if (allowed) {
      expect(run).not.toThrow();
    } else {
      expect(run).toThrow();
    }
  });

  it('does not let tokenLogin bypass the user finalizing state', () => {
    const result = resolveAccountCancellationAccess({
      req: { method: 'GET', url: '/api/support/user/account/login/tokenLogin' },
      accountCancellationAccess: 'tokenLogin'
    });

    expect(result).toMatchObject({
      allowUserAccountCancellationPending: true,
      allowUserAccountCancellationFinalizing: false,
      allowCurrentSessionTeamAccountCancellationFinalizing: true
    });
  });
});
