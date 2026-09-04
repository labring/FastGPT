import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccountCancellationCache,
  LeaseCache,
  RedisLeaseUnavailableError
} from '@fastgpt/dal/redis/caches';

import {
  assertAccountCancellationMethod,
  clearAccountCancellationCache,
  getAccountCancellationCacheTargets,
  syncAccountCancellationCache,
  withAccountCancellationTeamLock,
  withAccountCancellationUserLock
} from '@fastgpt/service/support/user/account/cancellation/service';
import { accountExternalVerificationMethods } from '@fastgpt/global/support/user/account/verification/constants';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

describe('assertAccountCancellationMethod', () => {
  it.each(accountExternalVerificationMethods)('accepts %s', (method) => {
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

describe('account cancellation cache synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('collects team/user targets and updates team and user keys', async () => {
    vi.spyOn(MongoTeam, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: 'team-1' }])
    } as any);
    const set = vi.spyOn(AccountCancellationCache.prototype, 'set').mockResolvedValue(undefined);

    await expect(getAccountCancellationCacheTargets('user-1')).resolves.toEqual({
      teamIds: ['team-1'],
      userIds: ['user-1']
    });
    await syncAccountCancellationCache({
      userId: 'user-1',
      active: true,
      targets: { teamIds: ['team-1'], userIds: ['user-1'] }
    });

    expect(set).toHaveBeenCalledWith('team', 'team-1', true);
    expect(set).toHaveBeenCalledWith('user', 'user-1', true);
  });

  it('clears all markers and exposes lifecycle cache write failures', async () => {
    const error = new Error('redis unavailable');
    const set = vi.spyOn(AccountCancellationCache.prototype, 'set').mockRejectedValue(error);
    const clearMany = vi
      .spyOn(AccountCancellationCache.prototype, 'clearMany')
      .mockResolvedValue(undefined);

    await expect(
      syncAccountCancellationCache({
        userId: 'user-1',
        active: true,
        targets: { teamIds: ['team-1'], userIds: ['user-1'] }
      })
    ).rejects.toBe(error);

    expect(set).toHaveBeenCalled();
    expect(clearMany).toHaveBeenCalledWith({ scope: 'team', ids: ['team-1'] });
    expect(clearMany).toHaveBeenCalledWith({ scope: 'user', ids: ['user-1'] });
  });

  it('clears team and user markers without writing an inactive state', async () => {
    const clearMany = vi
      .spyOn(AccountCancellationCache.prototype, 'clearMany')
      .mockResolvedValue(undefined);

    await clearAccountCancellationCache({
      userId: 'user-1',
      targets: { teamIds: ['team-1'], userIds: ['user-1'] }
    });

    expect(clearMany).toHaveBeenCalledWith({ scope: 'team', ids: ['team-1'] });
    expect(clearMany).toHaveBeenCalledWith({ scope: 'user', ids: ['user-1'] });
  });
});
