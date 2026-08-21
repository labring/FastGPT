import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountCancellationCache } from '@fastgpt/dal/redis/caches';

describe('AccountCancellationCache', () => {
  const redis = {
    evalScript: vi.fn(),
    set: vi.fn(),
    setIfAbsent: vi.fn(),
    deleteMany: vi.fn()
  };
  const logger = { warn: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.evalScript.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    redis.setIfAbsent.mockResolvedValue(true);
    redis.deleteMany.mockResolvedValue(undefined);
  });

  it('reads active, inactive and missing states using scoped keys and refreshes TTL', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    redis.evalScript.mockResolvedValueOnce('1');
    await expect(cache.get('team', 'team/1')).resolves.toBe(true);

    redis.evalScript.mockResolvedValueOnce('0');
    await expect(cache.get('user', 'user-1')).resolves.toBe(false);

    await expect(cache.get('team', 'missing')).resolves.toBeUndefined();
    expect(redis.evalScript).toHaveBeenNthCalledWith(1, {
      script: expect.stringContaining('pexpire'),
      keys: ['account-cancellation:team:team%2F1'],
      args: [300000]
    });
    expect(redis.evalScript).toHaveBeenNthCalledWith(2, {
      script: expect.stringContaining('pexpire'),
      keys: ['account-cancellation:user:user-1'],
      args: [300000]
    });
  });

  it('writes 0/1 status with a five-minute TTL', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await cache.set('user', 'user-1', false);

    expect(redis.set).toHaveBeenCalledWith({
      key: 'account-cancellation:user:user-1',
      value: '0',
      ttlMs: 300000
    });
  });

  it('initializes only missing keys with an atomic SET NX and five-minute TTL', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await expect(cache.setIfAbsent('user', 'user-1', true)).resolves.toBe(true);

    expect(redis.setIfAbsent).toHaveBeenCalledWith({
      key: 'account-cancellation:user:user-1',
      value: '1',
      ttlSeconds: 300
    });
  });

  it('deduplicates batch refreshes', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await cache.setMany({ scope: 'user', ids: ['user-1', 'user-1', 'user-2'], active: true });

    expect(redis.set).toHaveBeenCalledTimes(2);
  });

  it('clears deduplicated scoped markers', async () => {
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await cache.clearMany({ scope: 'user', ids: ['user-1', 'user-1', 'user-2'] });

    expect(redis.deleteMany).toHaveBeenCalledWith([
      'account-cancellation:user:user-1',
      'account-cancellation:user:user-2'
    ]);
  });

  it('converts Redis read failures into a miss and exposes lifecycle write failures', async () => {
    const readError = new Error('read failed');
    const writeError = new Error('write failed');
    redis.evalScript.mockRejectedValueOnce(readError);
    redis.set.mockRejectedValueOnce(writeError);
    redis.setIfAbsent.mockRejectedValueOnce(writeError);
    const cache = new AccountCancellationCache({ redis: redis as any, logger });

    await expect(cache.get('team', 'team-1')).resolves.toBeUndefined();
    await expect(cache.set('team', 'team-1', false)).rejects.toBe(writeError);
    await expect(cache.setIfAbsent('team', 'team-1', false)).resolves.toBe(false);

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
    expect(logger.warn).toHaveBeenNthCalledWith(
      3,
      'Failed to initialize account cancellation cache',
      {
        scope: 'team',
        id: 'team-1',
        active: false,
        error: writeError
      }
    );
  });
});
