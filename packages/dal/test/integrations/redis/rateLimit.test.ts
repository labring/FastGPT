import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { RateLimitCache } from '@fastgpt/dal/redis/caches';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('RateLimitCache Redis 7.2 integration', () => {
  const key = `integration-fixed-window-${process.pid}-${Date.now()}`;
  const physicalKey = `fastgpt:${key}`;
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

  it('assigns unique counts under concurrency and keeps one fixed TTL', async () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client });
    const cache = new RateLimitCache({ redis: adapter });

    const results = await Promise.all(
      Array.from({ length: 64 }, () => cache.consume({ key, limit: 32, windowSeconds: 60 }))
    );

    expect(new Set(results.map((result) => result.currentCount))).toHaveLength(64);
    expect(results.filter((result) => result.allowed)).toHaveLength(32);
    expect(await client.get(physicalKey)).toBe('64');
    expect(await client.ttl(physicalKey)).toBeGreaterThan(0);
    expect(await client.ttl(physicalKey)).toBeLessThanOrEqual(60);
  });
});
