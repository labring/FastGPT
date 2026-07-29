import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asRedisLogicalKey, RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('Redis 7.2 kernel integration', () => {
  const namespace = `integration:redis-kernel:${process.pid}:${Date.now()}`;
  const valueKey = asRedisLogicalKey(`${namespace}:value`);
  const getOrSetKey = asRedisLogicalKey(`${namespace}:get-or-set`);
  const scanPrefix = asRedisLogicalKey(`${namespace}:scan:a*b`);
  const scanChildKeys = Array.from({ length: 256 }, (_, index) => `${scanPrefix}:child-${index}`);
  const unrelatedScanKey = `${namespace}:scan:aXb:child`;
  const leaseKey = asRedisLogicalKey(`${namespace}:lease`);
  const streamKey = asRedisLogicalKey(`${namespace}:stream`);
  const physical = (key: string) => `fastgpt:${key}`;
  const cleanupKeys = [
    physical(valueKey),
    physical(getOrSetKey),
    ...scanChildKeys.map(physical),
    physical(unrelatedScanKey),
    physical(leaseKey),
    physical(streamKey)
  ];

  let client: Redis;

  beforeAll(async () => {
    client = new Redis(redisUrl!, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    await client.connect();

    const serverInfo = await client.info('server');
    expect(serverInfo).toMatch(/redis_version:7\.2\./);
  });

  afterAll(async () => {
    if (!client) return;
    await client.del(...cleanupKeys);
    await client.quit();
  });

  const createAdapter = () =>
    new RedisCacheAdapter({
      getCommandClient: () => client,
      createBlockingConnection: () =>
        client.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null }),
      releaseConnection: async (blockingClient) => {
        const redisClient = blockingClient as Redis;
        if (redisClient.status === 'end' || redisClient.status === 'close') {
          redisClient.disconnect();
          return;
        }
        await redisClient.quit().catch(() => redisClient.disconnect());
      }
    });

  it('uses one explicit physical keyspace and safely paginates SCAN patterns', async () => {
    const adapter = createAdapter();

    await adapter.set({ key: valueKey, value: 'value' });
    expect(await client.get(physical(valueKey))).toBe('value');
    expect(await client.get(`fastgpt:${physical(valueKey)}`)).toBeNull();

    const pipeline = client.pipeline();
    scanChildKeys.forEach((key) => pipeline.set(physical(key), 'child'));
    pipeline.set(physical(unrelatedScanKey), 'unrelated');
    await pipeline.exec();

    const scannedKeys: string[] = [];
    for await (const keys of adapter.iterateByPrefix({ prefix: scanPrefix, batchSize: 16 })) {
      scannedKeys.push(...keys);
    }

    expect(new Set(scannedKeys)).toEqual(new Set(scanChildKeys));
    expect(await client.get(physical(unrelatedScanKey))).toBe('unrelated');
  });

  it('keeps SET NX GET atomic under concurrency', async () => {
    const adapter = createAdapter();
    const values = await Promise.all(
      Array.from({ length: 128 }, (_, index) =>
        adapter.getOrSet({ key: getOrSetKey, value: `candidate-${index}` })
      )
    );

    expect(new Set(values)).toHaveLength(1);
    expect(await client.get(physical(getOrSetKey))).toBe(values[0]);
  });

  it('keeps Lua lease ownership and token checks atomic under concurrency', async () => {
    const adapter = createAdapter();
    const tokens = Array.from({ length: 64 }, (_, index) => `token-${index}`);
    const acquired = await Promise.all(
      tokens.map((token) => adapter.acquireLease({ key: leaseKey, token, ttlMs: 5_000 }))
    );

    expect(acquired.filter(Boolean)).toHaveLength(1);
    const winner = tokens[acquired.findIndex(Boolean)]!;

    await expect(
      adapter.renewLease({ key: leaseKey, token: 'wrong-token', ttlMs: 5_000 })
    ).resolves.toBe(false);
    await expect(adapter.renewLease({ key: leaseKey, token: winner, ttlMs: 5_000 })).resolves.toBe(
      true
    );
    await expect(adapter.releaseLease({ key: leaseKey, token: 'wrong-token' })).resolves.toBe(
      false
    );
    await expect(adapter.releaseLease({ key: leaseKey, token: winner })).resolves.toBe(true);
    await expect(client.get(physical(leaseKey))).resolves.toBeNull();
  });

  it('writes, ranges, and blocks on a Redis Stream with an isolated reader connection', async () => {
    const adapter = createAdapter();
    const reader = adapter.createBlockingStreamReader({ key: streamKey, blockMs: 1_000 });

    try {
      const readPromise = reader.read('$');
      const appendPromise = new Promise<string>((resolve, reject) => {
        setTimeout(() => {
          void adapter
            .appendStreamEntry({ key: streamKey, fields: { raw: 'hello' } })
            .then(resolve, reject);
        }, 25);
      });

      const [entries, streamId] = await Promise.all([readPromise, appendPromise]);
      expect(entries).toEqual([{ id: streamId, fields: { raw: 'hello' } }]);
      await expect(
        adapter.rangeStream({ key: streamKey, start: '-', end: '+', count: 10 })
      ).resolves.toEqual([{ id: streamId, fields: { raw: 'hello' } }]);
    } finally {
      await reader.close();
    }
  });
});
