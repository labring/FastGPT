import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { TeamPointCache } from '@fastgpt/dal/redis/caches';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('TeamPointCache Redis 7.2 integration', () => {
  const teamId = `integration-team-point-${process.pid}-${Date.now()}`;
  const physicalKeys = [
    `fastgpt:cache:team_point_surplus:${teamId}`,
    `fastgpt:cache:team_point_total:${teamId}`
  ];
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
    await client.del(...physicalKeys);
    await client.quit();
  });

  it('reads and refreshes both keys with the same TTL', async () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client });
    const cache = new TeamPointCache({ redis: adapter });

    await cache.set({ teamId, totalPoints: 2_000, surplusPoints: 1_500 });
    await expect(cache.get(teamId)).resolves.toEqual({
      totalPoints: 2_000,
      surplusPoints: 1_500
    });
    expect(await client.ttl(physicalKeys[0])).toBeGreaterThan(55);
    expect(await client.ttl(physicalKeys[1])).toBeGreaterThan(55);
  });

  it('keeps pair reads coherent while concurrent pair writes occur', async () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client });
    const cache = new TeamPointCache({ redis: adapter });
    await cache.set({ teamId, totalPoints: 0, surplusPoints: 0 });

    const reads = await Promise.all(
      Array.from({ length: 64 }, (_, index) =>
        Promise.all([
          cache.set({ teamId, totalPoints: index, surplusPoints: -index }),
          cache.get(teamId)
        ]).then(([, value]) => value)
      )
    );

    reads.forEach((value) => {
      if (!value) return;
      expect(value.surplusPoints + value.totalPoints).toBe(0);
    });
  });

  it('increments surplus with TTL and clears both keys together', async () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client });
    const cache = new TeamPointCache({ redis: adapter });

    await cache.set({ teamId, totalPoints: 100, surplusPoints: 40 });
    await cache.incrementSurplus({ teamId, value: -5 });
    await expect(cache.get(teamId)).resolves.toEqual({
      totalPoints: 100,
      surplusPoints: 35
    });
    await cache.clear(teamId);
    await expect(cache.get(teamId)).resolves.toBeUndefined();
  });
});
