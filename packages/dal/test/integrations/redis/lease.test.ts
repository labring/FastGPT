import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { LeaseCache, RedisLeaseLostError } from '@fastgpt/dal/redis/caches/lease';

const { leaseLogger, concurrencyLogger } = vi.hoisted(() => ({
  leaseLogger: { warn: vi.fn(), info: vi.fn() },
  concurrencyLogger: { warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@fastgpt-sdk/otel/logger', () => ({
  getLogger: (categories: string[]) => {
    const category = categories.join('.');
    if (category === 'redis.lease') return leaseLogger;
    if (category === 'redis.lease.concurrency') return concurrencyLogger;
    throw new Error(`Unexpected logger category: ${category}`);
  }
}));

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('LeaseCache concurrency Redis integration', () => {
  const namespace = `integration:concurrency-lease:${process.pid}:${Date.now()}`;
  const keys = ['shared', 'ttl', 'takeover', 'waiters'].map((name) => `${namespace}:${name}`);
  const physicalKey = (key: string) => `fastgpt:lock:concurrency:${key}`;
  const queueKey = (key: string) => `fastgpt:lock:concurrency-waiters:${key}`;
  let client: Redis;
  let adapter: RedisCacheAdapter;

  beforeAll(async () => {
    client = new Redis(redisUrl!, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await client.connect();
    adapter = new RedisCacheAdapter({ getCommandClient: () => client });
  });

  afterAll(async () => {
    if (!client) return;
    await client.del(...keys.flatMap((key) => [physicalKey(key), queueKey(key)]));
    await client.quit();
  });

  it('atomically limits concurrent instances and prunes expired tokens', async () => {
    const key = keys[0];
    await client.zadd(physicalKey(key), 1, 'expired-token');
    const caches = [new LeaseCache({ redis: adapter }), new LeaseCache({ redis: adapter })];
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

  it('logs shared queue counts once per waiter and removes cancelled or expired entries', async () => {
    const key = keys[3];
    concurrencyLogger.info.mockClear();
    const caches = [new LeaseCache({ redis: adapter }), new LeaseCache({ redis: adapter })];
    let finish!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const options = { key, label: 'queue', concurrency: 1, ttlMs: 1_000, retryIntervalMs: 5 };
    const running = caches[0].withConcurrency({
      ...options,
      fn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
          started();
        })
    });
    await ready;
    await client.zadd(queueKey(key), 1, 'expired-waiter');
    const controllers = [new AbortController(), new AbortController()];
    const work = vi.fn(async () => undefined);
    const cancelled = controllers.map((controller, index) =>
      expect(
        caches[index].withConcurrency({
          ...options,
          signal: controller.signal,
          fn: work
        })
      ).rejects.toThrow('cancelled')
    );
    try {
      await vi.waitFor(async () => {
        expect(await client.zcard(queueKey(key))).toBe(2);
        expect(concurrencyLogger.info).toHaveBeenCalledTimes(2);
      });
      expect(
        concurrencyLogger.info.mock.calls.map(([, metadata]) => metadata.queuedCount).sort()
      ).toEqual([1, 2]);
      expect(await client.zcard(physicalKey(key))).toBe(1);
      expect(work).not.toHaveBeenCalled();
    } finally {
      controllers.forEach((controller) => controller.abort(new Error('cancelled')));
      await Promise.all(cancelled);
      finish();
      await running;
    }
    expect(await client.exists(queueKey(key))).toBe(0);
  });

  it('keeps a long holder alive when a shorter holder acquires and renews', async () => {
    const key = keys[1];
    const cache = new LeaseCache({ redis: adapter });
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
    const cache = new LeaseCache({ redis: adapter });
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
