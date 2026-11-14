import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { LoginRiskCache } from '@fastgpt/dal/redis/caches/loginRisk';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('LoginRiskCache remote Redis integration', () => {
  const id = `puzzle-test-${randomUUID()}`;
  const scope = { account: `${id}-account`, ip: `${id}-ip` };
  const keys = ['attempt', 'failure'].flatMap((kind) => [
    `fastgpt:login-risk:${kind}:account:${scope.account}`,
    `fastgpt:login-risk:${kind}:ip:${scope.ip}`
  ]);
  let client: Redis;
  let cache: LoginRiskCache;

  beforeAll(async () => {
    client = new Redis(redisUrl!, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1
    });
    await client.connect();
    cache = new LoginRiskCache(new RedisCacheAdapter({ getCommandClient: () => client }));
    const info = await client.info('server');
    console.log(`Remote Redis version: ${info.match(/redis_version:([^\r\n]+)/)?.[1]}`);
  });
  afterAll(async () => {
    await client.del(...keys);
    await client.quit();
  });

  it('atomically counts concurrent account and IP attempts and separates the failure window', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => cache.recordAttempt(scope)));
    expect(new Set(results.map((r) => r.account)).size).toBe(25);
    expect(new Set(results.map((r) => r.ip)).size).toBe(25);
    expect(await cache.getFailures(scope)).toEqual({ account: 0, ip: 0 });
    await Promise.all(Array.from({ length: 10 }, () => cache.recordFailure(scope)));
    expect(await cache.getFailures(scope)).toEqual({ account: 10, ip: 10 });
    expect(await client.ttl(keys[0])).toBeGreaterThan(0);
    expect(await client.ttl(keys[0])).toBeLessThanOrEqual(60);
    expect(await client.ttl(keys[2])).toBeGreaterThan(60);
    expect(await client.ttl(keys[2])).toBeLessThanOrEqual(600);
  });
});
