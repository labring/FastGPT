import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { LeaseCache, RedisLeaseLostError } from '@fastgpt/dal/redis/caches/lease';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('LeaseCache concurrency Redis integration', () => {
  const namespace = `integration:concurrency-lease:${process.pid}:${Date.now()}`;
  const keys = ['shared', 'ttl', 'takeover'].map((name) => `${namespace}:${name}`);
  const physicalKey = (key: string) => `fastgpt:lock:concurrency:${key}`;
  let client: Redis;
  let adapter: RedisCacheAdapter;
  const logger = { warn: () => undefined };

  beforeAll(async () => {
    client = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await client.connect();
    adapter = new RedisCacheAdapter({ getCommandClient: () => client });
  });

  afterAll(async () => {
    if (!client) return;
    await client.del(...keys.map(physicalKey));
    await client.quit();
  });

  it('atomically limits concurrent instances and prunes expired tokens', async () => {
    const key = keys[0];
    await client.zadd(physicalKey(key), 1, 'expired-token');
    const caches = [
      new LeaseCache({ redis: adapter, logger }),
      new LeaseCache({ redis: adapter, logger })
    ];
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        caches[index % 2].withConcurrency({
          key,
          label: 'integration',
          concurrency: 3,
          ttlMs: 1_000,
          retryIntervalMs: 5,
          fn: async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((resolve) => setTimeout(resolve, 20));
            active--;
          }
        })
      )
    );
    expect(peak).toBe(3);
    expect(await client.exists(physicalKey(key))).toBe(0);
  });

  it('keeps a long holder alive when a shorter holder acquires and renews', async () => {
    const key = keys[1];
    const cache = new LeaseCache({ redis: adapter, logger });
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const long = cache.withConcurrency({
      key,
      label: 'long',
      concurrency: 2,
      ttlMs: 2_000,
      fn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
          started();
        })
    });
    await ready;
    try {
      await cache.withConcurrency({
        key,
        label: 'short',
        concurrency: 2,
        ttlMs: 100,
        renewIntervalMs: 10,
        fn: async ({ assertValid }) => {
          await new Promise((resolve) => setTimeout(resolve, 35));
          assertValid();
          expect(await client.pttl(physicalKey(key))).toBeGreaterThan(1_000);
        }
      });
      expect(await client.zcard(physicalKey(key))).toBe(1);
    } finally {
      finish();
      await long;
    }
  });

  it('never releases a replacement holder when an old lease loses its token', async () => {
    const key = keys[2];
    const cache = new LeaseCache({ redis: adapter, logger });
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const old = expect(
      cache.withConcurrency({
        key,
        label: 'old',
        concurrency: 1,
        ttlMs: 1_000,
        renewIntervalMs: 50,
        fn: ({ signal }) =>
          new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            started();
          })
      })
    ).rejects.toBeInstanceOf(RedisLeaseLostError);
    await ready;
    await client.del(physicalKey(key));
    await cache.withConcurrency({
      key,
      label: 'replacement',
      concurrency: 1,
      ttlMs: 1_000,
      fn: async () => {
        await old;
        expect(await client.zcard(physicalKey(key))).toBe(1);
      }
    });
    expect(await client.exists(physicalKey(key))).toBe(0);
  });
});
