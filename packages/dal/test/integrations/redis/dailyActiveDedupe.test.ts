import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { DailyActiveDedupeCache } from '@fastgpt/dal/redis/caches';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('DailyActiveDedupeCache Redis 7.2 integration', () => {
  const uid = `integration-${process.pid}-${Date.now()}`;
  const date = '2026-07-24';
  const physicalKey = `fastgpt:cache:dailyUserActive:${uid}_${date}`;
  const logger = { warn: vi.fn() };
  let client: Redis;

  beforeAll(async () => {
    client = new Redis(redisUrl!, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.del(physicalKey);
    await client.quit();
  });

  it('allows exactly one winner across concurrent claims and keeps the historical TTL', async () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client });
    const cache = new DailyActiveDedupeCache({ redis: adapter, logger });

    const results = await Promise.all(
      Array.from({ length: 64 }, () => cache.shouldRecord({ uid, date }))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await client.get(physicalKey)).toBe('1');
    expect(await client.ttl(physicalKey)).toBeGreaterThan(86_390);
    expect(await client.ttl(physicalKey)).toBeLessThanOrEqual(86_400);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
