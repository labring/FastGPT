import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_CANCELLATION_CACHE_TTL_MS,
  AccountCancellationCache
} from '@fastgpt/dal/redis/caches';

describe('AccountCancellationCache', () => {
  const redis = {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn()
  };
  const logger = { warn: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(true);
  });

  it('reads active, inactive and missing states using scoped encoded keys', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    redis.get.mockResolvedValueOnce('1');
    await expect(cache.get('team', 'team/1')).resolves.toBe(true);

    redis.get.mockResolvedValueOnce('0');
    await expect(cache.get('member', 'tmb-1')).resolves.toBe(false);

    await expect(cache.get('team', 'missing')).resolves.toBeUndefined();
    expect(redis.get).toHaveBeenNthCalledWith(1, 'account-cancellation:v1:team:team%2F1');
  });

  it('writes status with the shared short TTL and clears markers', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await cache.set('member', 'tmb-1', true);
    await cache.clear('member', 'tmb-1');

    expect(redis.set).toHaveBeenCalledWith({
      key: 'account-cancellation:v1:member:tmb-1',
      value: '1',
      ttlMs: ACCOUNT_CANCELLATION_CACHE_TTL_MS
    });
    expect(redis.delete).toHaveBeenCalledWith('account-cancellation:v1:member:tmb-1');
  });

  it('deduplicates batch refreshes', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await cache.setMany({ scope: 'team', ids: ['team-1', 'team-1', 'team-2'], active: true });

    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('converts Redis read and write failures into a miss or no-op', async () => {
    const readError = new Error('read failed');
    const writeError = new Error('write failed');
    redis.get.mockRejectedValueOnce(readError);
    redis.set.mockRejectedValueOnce(writeError);
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await expect(cache.get('team', 'team-1')).resolves.toBeUndefined();
    await expect(cache.set('team', 'team-1', false)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenNthCalledWith(1, 'Failed to read account cancellation cache', {
      scope: 'team',
      id: 'team-1',
      error: readError
    });
    expect(logger.warn).toHaveBeenNthCalledWith(2, 'Failed to write account cancellation cache', {
      scope: 'team',
      id: 'team-1',
      active: false,
      error: writeError
    });
  });
});
