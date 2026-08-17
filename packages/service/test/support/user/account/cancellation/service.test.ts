import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';

import {
  assertAccountCancellationMethod,
  withAccountCancellationTeamLock,
  withAccountCancellationUserLock
} from '@fastgpt/service/support/user/account/cancellation/service';
import { accountCancellationAllowedMethods } from '@fastgpt/global/support/user/account/cancellation/constants';

describe('assertAccountCancellationMethod', () => {
  it.each(accountCancellationAllowedMethods)('accepts %s', (method) => {
    expect(() => assertAccountCancellationMethod(method)).not.toThrow();
  });

  it.each(['oldPassword', 'oauth/unknown', '', 'CODE', 'oauth/Google', 'oauth', 'code '])(
    'rejects invalid method %s',
    (method) => {
      expect(() => assertAccountCancellationMethod(method)).toThrow(
        'Password verification is not allowed for account cancellation'
      );
    }
  );
});

describe('account cancellation leases', () => {
  let withLease: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    withLease = vi.spyOn(LeaseCache.prototype, 'withLease');
    withLease.mockImplementation(async ({ fn }) => fn());
  });

  it('uses a user-scoped lease and returns the callback result', async () => {
    const fn = vi.fn().mockResolvedValue('done');

    await expect(withAccountCancellationUserLock('user-1', fn)).resolves.toBe('done');

    expect(withLease).toHaveBeenCalledWith({
      key: 'accountCancellation:user-1',
      label: 'account-cancellation-user',
      ttlMs: 600000,
      fn: expect.any(Function)
    });
    expect(fn).toHaveBeenCalledOnce();
  });

  it('uses a team-scoped lease and maps lease contention to a business error', async () => {
    withLease.mockRejectedValue(
      new RedisLeaseUnavailableError({ key: 'accountCancellation:team:team-1', label: 'test' })
    );

    await expect(withAccountCancellationTeamLock('team-1', vi.fn())).rejects.toThrow(
      'Account cancellation team operation is busy'
    );
    expect(withLease).toHaveBeenCalledWith({
      key: 'accountCancellation:team:team-1',
      label: 'account-cancellation-team',
      ttlMs: 600000,
      fn: expect.any(Function)
    });
  });

  it('preserves non-contention failures', async () => {
    const error = new Error('redis unavailable');
    withLease.mockRejectedValue(error);

    await expect(withAccountCancellationUserLock('user-1', vi.fn())).rejects.toBe(error);
  });
});
