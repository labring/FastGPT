import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SessionTokenCache } from '@fastgpt/dal/redis/caches/sessionToken';
import { UserSessionTokenService } from '@fastgpt/service/support/user/session/service';
import { SessionErrEnum } from '@fastgpt/global/common/error/code/session';

describe('user session credentials against real Redis', () => {
  const userId = `token-test-${randomUUID()}`;
  let client: Redis;
  let cache: SessionTokenCache;
  let service: UserSessionTokenService;
  let now = Date.now();

  beforeAll(async () => {
    if (!process.env.REDIS_INTEGRATION_URL)
      throw new Error('Dedicated remote Redis URL is required');
    client = new Redis(process.env.REDIS_INTEGRATION_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false
    });
    await client.connect();
    cache = new SessionTokenCache({
      redis: new RedisCacheAdapter({ getCommandClient: () => client })
    });
    service = new UserSessionTokenService({
      cache,
      secret: 'integration-only-session-encryption-secret',
      now: () => now
    });
  });

  afterAll(async () => {
    if (!client) return;
    for (const row of await cache.listByUser(userId)) await cache.delete(row.sessionId);
    await client.quit();
  });

  beforeEach(() => {
    now = Date.now();
  });

  it.each([{ accessTtlSeconds: 61 }, { refreshTtlSeconds: 61 }])(
    'rejects an extendable lifetime shorter than the pre-refresh and replay windows: %j',
    (policy) => {
      expect(
        () => new UserSessionTokenService({ cache, secret: 'invalid-lifetime-policy', policy })
      ).toThrow('Extendable token lifetime must cover');
    }
  );

  it('authenticates only Access and refreshes into the same device without extending the absolute cap', async () => {
    const initial = await service.create({
      userId,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: true
    });
    expect(initial.token).not.toBe(initial.refreshToken);
    expect(initial.session.accessExpiresAt - now).toBe(900_000);
    expect(initial.session.refreshExpiresAt - now).toBe(604_800_000);
    await expect(service.auth(initial.token)).resolves.toMatchObject({
      sessionId: initial.session.sessionId,
      isRoot: true
    });
    await expect(service.auth(initial.refreshToken)).rejects.toThrow(SessionErrEnum.accessInvalid);
    await expect(service.auth(initial.session.sessionId)).rejects.toThrow(
      SessionErrEnum.accessInvalid
    );
    now += 900_000;
    await expect(service.auth(initial.token)).rejects.toThrow(SessionErrEnum.accessExpired);
    const renewed = await service.refresh({
      refreshToken: initial.refreshToken,
      accessToken: initial.token
    });
    expect(renewed.status).toBe('rotated');
    expect(renewed.credentials!.session).toMatchObject({
      sessionId: initial.session.sessionId,
      createdAt: initial.session.createdAt,
      absoluteExpiresAt: initial.session.absoluteExpiresAt,
      generation: 2
    });
    expect(renewed.credentials!.session.refreshExpiresAt).toBe(now + 604_800_000);
    await expect(service.auth(renewed.credentials!.token)).resolves.toMatchObject({ isRoot: true });
    expect(
      (await cache.listByUser(userId)).filter((row) => row.sessionId === initial.session.sessionId)
    ).toHaveLength(1);
  });

  it('returns identical credentials across service instances and keeps in-flight Access valid until its original expiry', async () => {
    const pair = await service.create({ userId, teamId: 'team-1', tmbId: 'tmb-1', isRoot: false });
    now += 840_000;
    const second = new UserSessionTokenService({
      cache: new SessionTokenCache({
        redis: new RedisCacheAdapter({ getCommandClient: () => client })
      }),
      secret: 'integration-only-session-encryption-secret',
      now: () => now
    });
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        (i % 2 ? service : second).refresh({
          refreshToken: pair.refreshToken,
          accessToken: pair.token
        })
      )
    );
    expect(results.filter((r) => r.status === 'rotated')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'replayed')).toHaveLength(23);
    expect(new Set(results.map((r) => r.credentials!.token)).size).toBe(1);
    expect(new Set(results.map((r) => r.credentials!.refreshToken)).size).toBe(1);
    await expect(service.auth(pair.token)).resolves.toMatchObject({
      sessionId: pair.session.sessionId
    });
    const successor = results[0].credentials!;
    const missingAccess = await service.refresh({ refreshToken: successor.refreshToken });
    expect(missingAccess.status).toBe('replayed');
    expect(missingAccess.credentials!.token).toBe(successor.token);
    expect(missingAccess.credentials!.refreshToken).toBe(successor.refreshToken);
    const state = await cache.get(pair.session.sessionId);
    const fresh = await service.refresh({
      refreshToken: successor.refreshToken,
      accessToken: successor.token
    });
    expect(fresh.status).toBe('fresh');
    expect(await cache.get(pair.session.sessionId)).toEqual(state);
    const stored =
      JSON.stringify(await client.hgetall(`fastgpt:session-token:{${pair.session.sessionId}}`)) +
      (await client.get(`fastgpt:session-token-replay:{${pair.session.sessionId}}`));
    expect(stored).not.toContain(successor.token);
    expect(stored).not.toContain(successor.refreshToken);
    now += 60_000;
    await expect(service.auth(pair.token)).rejects.toThrow(SessionErrEnum.accessExpired);
    await expect(service.auth(successor.token)).resolves.toMatchObject({ generation: 2 });
  });

  it('caps a continuously renewed session at its first-login absolute deadline', async () => {
    let pair = await service.create({ userId, teamId: 'team-1', tmbId: 'tmb-1', isRoot: false });
    const start = now;
    const deadline = pair.session.absoluteExpiresAt;
    for (const day of [6, 12, 18, 24, 29]) {
      now = start + day * 86_400_000;
      const result = await service.refresh({
        refreshToken: pair.refreshToken,
        accessToken: pair.token
      });
      pair = result.credentials!;
      expect(pair.session.createdAt).toBe(start);
      expect(pair.session.absoluteExpiresAt).toBe(deadline);
      expect(pair.session.refreshExpiresAt).toBeLessThanOrEqual(deadline);
    }
    expect(pair.session.refreshExpiresAt).toBe(deadline);
    now = deadline;
    await expect(service.refresh({ refreshToken: pair.refreshToken })).rejects.toThrow(
      SessionErrEnum.refreshExpired
    );
    await expect(service.auth(pair.token)).rejects.toThrow(SessionErrEnum.revoked);
  });

  it('keeps one successor near the absolute deadline instead of rotating repeatedly inside the replay window', async () => {
    const short = new UserSessionTokenService({
      cache,
      secret: 'short-absolute-session-test',
      now: () => now,
      policy: { absoluteTtlSeconds: 30, refreshTtlSeconds: 30 }
    });
    const original = await short.create({
      userId,
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false
    });
    const first = await short.refresh({
      refreshToken: original.refreshToken,
      accessToken: original.token
    });
    const pair = first.credentials!;
    const second = await short.refresh({
      refreshToken: pair.refreshToken,
      accessToken: pair.token
    });
    expect(second.status).toBe('fresh');
    expect(second.session.generation).toBe(pair.session.generation);
    expect(second.session.absoluteExpiresAt).toBe(original.session.absoluteExpiresAt);
    const retry = await short.refresh({ refreshToken: original.refreshToken });
    expect(retry.status).toBe('replayed');
    expect(retry.credentials!.token === pair.token).toBe(true);
    now = original.session.absoluteExpiresAt;
    await expect(short.refresh({ refreshToken: pair.refreshToken })).rejects.toThrow(
      SessionErrEnum.refreshExpired
    );
  });

  it('invalidates both credentials on security rekey while preserving stable session and absolute expiry', async () => {
    const pair = await service.create({ userId, teamId: 'team-1', tmbId: 'tmb-1', isRoot: true });
    const changed = await service.rekey({
      sessionId: pair.session.sessionId,
      teamId: 'team-2',
      tmbId: 'tmb-2'
    });
    expect(changed.session).toMatchObject({
      sessionId: pair.session.sessionId,
      createdAt: pair.session.createdAt,
      absoluteExpiresAt: pair.session.absoluteExpiresAt,
      contextVersion: 2
    });
    await expect(service.auth(pair.token)).rejects.toThrow(SessionErrEnum.contextChanged);
    await expect(service.refresh({ refreshToken: pair.refreshToken })).rejects.toThrow(
      SessionErrEnum.contextChanged
    );
    await expect(service.auth(changed.token)).resolves.toMatchObject({
      teamId: 'team-2',
      isRoot: true
    });
  });
});
