import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import { createTeamPointRepository } from '@fastgpt/dal/redis/repositories';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('TeamPointRepository Redis 7.2 integration', () => {
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
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });
    const repository = createTeamPointRepository({ redis: adapter });

    await repository.set({ teamId, totalPoints: 2_000, surplusPoints: 1_500 });
    await expect(repository.get(teamId)).resolves.toEqual({
      totalPoints: 2_000,
      surplusPoints: 1_500
    });
    expect(await client.ttl(physicalKeys[0])).toBeGreaterThan(55);
    expect(await client.ttl(physicalKeys[1])).toBeGreaterThan(55);
  });

  it('keeps pair reads coherent while concurrent pair writes occur', async () => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });
    const repository = createTeamPointRepository({ redis: adapter });
    await repository.set({ teamId, totalPoints: 0, surplusPoints: 0 });

    const reads = await Promise.all(
      Array.from({ length: 64 }, (_, index) =>
        Promise.all([
          repository.set({ teamId, totalPoints: index, surplusPoints: -index }),
          repository.get(teamId)
        ]).then(([, value]) => value)
      )
    );

    reads.forEach((value) => {
      if (!value) return;
      expect(value.surplusPoints).toBe(-value.totalPoints);
    });
  });

  it('increments surplus with TTL and clears both keys together', async () => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client });
    const repository = createTeamPointRepository({ redis: adapter });

    await repository.set({ teamId, totalPoints: 100, surplusPoints: 40 });
    await repository.incrementSurplus({ teamId, value: -5 });
    await expect(repository.get(teamId)).resolves.toEqual({
      totalPoints: 100,
      surplusPoints: 35
    });
    await repository.clear(teamId);
    await expect(repository.get(teamId)).resolves.toBeUndefined();
  });
});
