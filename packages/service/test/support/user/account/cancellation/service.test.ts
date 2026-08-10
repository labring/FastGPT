import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';

import {
  withAccountCancellationTeamLock,
  withAccountCancellationUserLock
} from '@fastgpt/service/support/user/account/cancellation/service';

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
