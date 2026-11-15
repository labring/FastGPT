import Redis from 'ioredis';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SessionTokenCache } from '@fastgpt/dal/redis/caches/sessionToken';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('dual-token Session real Redis integration', () => {
  const userId = `session-test-${randomUUID()}`;
  const ids: string[] = [];
  let client: Redis;
  let cache: SessionTokenCache;

  beforeAll(async () => {
    client = new Redis(redisUrl!, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    await client.connect();
    cache = new SessionTokenCache({
      redis: new RedisCacheAdapter({ getCommandClient: () => client })
    });
  });

  afterAll(async () => {
    if (!client) return;
    // 只删除本轮明确创建的会话和其幂等结果，不清空远端测试 DB。
    for (const id of ids) await cache.delete(id);
    await client.quit();
  });

  it('creates one stable device session and refuses an overwrite of the same ID', async () => {
    const sessionId = `${userId}:${randomBytes(24).toString('base64url')}`;
    ids.push(sessionId);
    const now = Date.now();
    const data = {
      userId,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      createdAt: now,
      accessHash: 'a'.repeat(64),
      accessExpiresAt: now + 900_000,
      refreshHash: 'b'.repeat(64),
      refreshExpiresAt: now + 604_800_000,
      absoluteExpiresAt: now + 2_592_000_000,
      generation: 1,
      contextVersion: 1
    };

    await expect(cache.create({ sessionId, data })).resolves.toBe(true);
    await expect(
      cache.create({ sessionId, data: { ...data, teamId: 'wrong-team' } })
    ).resolves.toBe(false);
    await expect(cache.get(sessionId)).resolves.toEqual(data);
    await expect(cache.listByUser(userId)).resolves.toEqual([{ sessionId, data }]);
    expect(await client.pttl(`fastgpt:session-token:{${sessionId}}`)).toBeGreaterThan(600_000_000);
  });

  it('gives concurrent instances one successor and replays the identical result after response loss', async () => {
    const sessionId = `${userId}:${randomBytes(24).toString('base64url')}`;
    ids.push(sessionId);
    const now = Date.now();
    const data = {
      userId,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      createdAt: now - 800_000,
      accessHash: 'a'.repeat(64),
      accessExpiresAt: now + 30_000,
      refreshHash: 'b'.repeat(64),
      refreshExpiresAt: now + 86_400_000,
      absoluteExpiresAt: now + 2_592_000_000,
      generation: 1,
      contextVersion: 1
    };
    await cache.create({ sessionId, data });
    const otherCache = new SessionTokenCache({
      redis: new RedisCacheAdapter({ getCommandClient: () => client })
    });
    const results = await Promise.all(
      Array.from({ length: 32 }, (_, i) =>
        (i % 2 ? cache : otherCache).rotate({
          sessionId,
          refreshHash: data.refreshHash,
          now,
          preRefreshMs: 60_000,
          replayTtlMs: 60_000,
          next: {
            ...data,
            generation: 2,
            accessHash: i.toString(16).padStart(64, '0'),
            refreshHash: (i + 32).toString(16).padStart(64, '0'),
            accessExpiresAt: now + 900_000,
            refreshExpiresAt: now + 604_800_000
          },
          envelope: `encrypted-result-${i}`
        })
      )
    );
    expect(results.filter((r) => r.status === 'rotated')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'replayed')).toHaveLength(31);
    expect(new Set(results.map((r) => r.envelope)).size).toBe(1);
    expect(new Set(results.map((r) => r.data?.generation))).toEqual(new Set([2]));
    const current = (await cache.get(sessionId))!;
    expect(current.createdAt).toBe(data.createdAt);
    expect(current.previousAccessHash).toBe(data.accessHash);
    expect(current.previousAccessExpiresAt).toBe(data.accessExpiresAt);
    await expect(
      cache.listByUser(userId).then((r) => r.filter((s) => s.sessionId === sessionId))
    ).resolves.toHaveLength(1);
    const retry = await cache.rotate({
      sessionId,
      refreshHash: data.refreshHash,
      now: now + 1,
      preRefreshMs: 60_000,
      replayTtlMs: 60_000,
      next: { ...current, generation: 3 },
      envelope: 'must-not-win'
    });
    expect(retry.status).toBe('replayed');
    expect(retry.envelope).toBe(results[0].envelope);
  });

  it('does not renew a fresh AT, ignores forged RTs, and revokes only confirmed old-RT replay', async () => {
    const sessionId = `${userId}:${randomBytes(24).toString('base64url')}`;
    ids.push(sessionId);
    const now = Date.now();
    const data = {
      userId,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      createdAt: now,
      accessHash: 'a'.repeat(64),
      accessExpiresAt: now + 900_000,
      refreshHash: 'b'.repeat(64),
      refreshExpiresAt: now + 86_400_000,
      absoluteExpiresAt: now + 2_592_000_000,
      generation: 1,
      contextVersion: 1
    };
    await cache.create({ sessionId, data });
    const options = {
      sessionId,
      now,
      preRefreshMs: 60_000,
      replayTtlMs: 60_000,
      next: { ...data, generation: 2, accessHash: 'c'.repeat(64), refreshHash: 'd'.repeat(64) },
      envelope: 'encrypted-pair'
    };
    await expect(cache.rotate({ ...options, refreshHash: 'e'.repeat(64) })).resolves.toMatchObject({
      status: 'invalid'
    });
    await expect(cache.get(sessionId)).resolves.toEqual(data);
    await expect(
      cache.rotate({ ...options, refreshHash: data.refreshHash, accessHash: data.accessHash })
    ).resolves.toMatchObject({ status: 'fresh', data });
    await expect(cache.get(sessionId)).resolves.toEqual(data);
    await expect(
      cache.rotate({ ...options, refreshHash: data.refreshHash })
    ).resolves.toMatchObject({ status: 'rotated' });
    const replayKey = `fastgpt:session-token-replay:{${sessionId}}`;
    expect(await client.pttl(replayKey)).toBeGreaterThan(0);
    expect(await client.pttl(replayKey)).toBeLessThanOrEqual(60_000);
    // 精确结束本轮幂等窗口，避免通过固定等待掩盖时序问题。
    await client.del(replayKey);
    await expect(
      cache.rotate({ ...options, refreshHash: data.refreshHash })
    ).resolves.toMatchObject({ status: 'reuse' });
    await expect(cache.get(sessionId)).resolves.toBeUndefined();
    await expect(
      cache.rotate({ ...options, refreshHash: options.next.refreshHash })
    ).resolves.toMatchObject({ status: 'revoked' });
  });

  it('never recreates a revoked session and rejects the exact expiry boundary', async () => {
    for (const reason of ['revoked', 'expired'] as const) {
      const sessionId = `${userId}:${randomBytes(24).toString('base64url')}`;
      ids.push(sessionId);
      const now = Date.now();
      const data = {
        userId,
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: false,
        createdAt: now,
        accessHash: 'a'.repeat(64),
        accessExpiresAt: now + 900_000,
        refreshHash: 'b'.repeat(64),
        refreshExpiresAt: now + 86_400_000,
        absoluteExpiresAt: now + 86_400_000,
        generation: 1,
        contextVersion: 1
      };
      await cache.create({ sessionId, data });
      if (reason === 'revoked') await cache.delete(sessionId);
      const result = await cache.rotate({
        sessionId,
        refreshHash: data.refreshHash,
        now: reason === 'expired' ? data.refreshExpiresAt : now,
        preRefreshMs: 60_000,
        replayTtlMs: 60_000,
        next: { ...data, generation: 2 },
        envelope: 'not-written'
      });
      expect(result.status).toBe(reason);
      await expect(cache.get(sessionId)).resolves.toBeUndefined();
    }
  });
});
