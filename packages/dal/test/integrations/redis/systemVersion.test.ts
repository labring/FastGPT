import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import { createSystemVersionRepository } from '@fastgpt/dal/redis/repositories';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('SystemVersionRepository Redis 7.2 integration', () => {
  const key = `integration-system-version-${process.pid}-${Date.now()}`;
  const basePhysicalKey = `fastgpt:VERSION_KEY:${key}`;
  const childPhysicalKeys = Array.from(
    { length: 512 },
    (_, index) => `${basePhysicalKey}:team-${index}`
  );
  const unrelatedPhysicalKey = `${basePhysicalKey}-other:team-1`;
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
    await client.del(basePhysicalKey, unrelatedPhysicalKey, ...childPhysicalKeys);
    await client.quit();
  });

  it('returns one permanent UUID across concurrent first initialization', async () => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });
    const repository = createSystemVersionRepository({ redis: adapter });

    const versions = await Promise.all(
      Array.from({ length: 64 }, () => repository.getOrInitialize({ key }))
    );

    expect(new Set(versions)).toHaveLength(1);
    expect(await client.get(basePhysicalKey)).toBe(versions[0]);
    expect(await client.ttl(basePhysicalKey)).toBe(-1);
  });

  it('uses paginated SCAN to delete only child keys and preserves the base key', async () => {
    const pipeline = client.pipeline();
    childPhysicalKeys.forEach((childKey) => pipeline.set(childKey, 'child-version'));
    pipeline.set(unrelatedPhysicalKey, 'unrelated-version');
    await pipeline.exec();

    const scanSpy = vi.spyOn(client, 'scan');
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });
    const repository = createSystemVersionRepository({ redis: adapter });

    await repository.refresh({ key, id: '*' });

    expect(scanSpy.mock.calls.length).toBeGreaterThan(1);
    expect(await client.get(basePhysicalKey)).toBeTruthy();
    expect((await client.mget(...childPhysicalKeys)).every((value) => value === null)).toBe(true);
    expect(await client.get(unrelatedPhysicalKey)).toBe('unrelated-version');
  });
});
