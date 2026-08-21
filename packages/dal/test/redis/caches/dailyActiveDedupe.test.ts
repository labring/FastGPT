import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { DailyActiveDedupeCache } from '@fastgpt/dal/redis/caches';

describe('DailyActiveDedupeCache', () => {
  const redis = {
    setIfAbsent: vi.fn()
  };
  const logger = {
    warn: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.setIfAbsent.mockResolvedValue(true);
  });

  it('preserves the physical key, value and 86400 second TTL through the adapter', async () => {
    const commandClient = {
      set: vi.fn().mockResolvedValue('OK')
    };
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new DailyActiveDedupeCache({ redis: adapter, logger });

    await expect(cache.shouldRecord({ uid: 'user-1', date: '2026-07-24' })).resolves.toBe(true);

    expect(commandClient.set).toHaveBeenCalledWith(
      'fastgpt:cache:dailyUserActive:user-1_2026-07-24',
      '1',
      'EX',
      86_400,
      'NX'
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns false when the daily key was already claimed', async () => {
    redis.setIfAbsent.mockResolvedValue(false);
    const cache = new DailyActiveDedupeCache({ redis: redis as any, logger });

    await expect(cache.shouldRecord({ uid: 'user-1', date: '2026-07-24' })).resolves.toBe(false);
    expect(redis.setIfAbsent).toHaveBeenCalledWith({
      key: 'cache:dailyUserActive:user-1_2026-07-24',
      value: '1',
      ttlSeconds: 86_400
    });
  });

  it('fails open and logs when Redis cannot claim the key', async () => {
    const error = new Error('redis unavailable');
    redis.setIfAbsent.mockRejectedValue(error);
    const cache = new DailyActiveDedupeCache({ redis: redis as any, logger });

    await expect(cache.shouldRecord({ uid: 'user-1', date: '2026-07-24' })).resolves.toBe(true);
    expect(logger.warn).toHaveBeenCalledWith('Daily active dedupe failed open', { error });
  });
});
