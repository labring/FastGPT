import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import { createDingtalkAccessTokenRepository } from '@fastgpt/dal/redis/repositories';

const server = {
  appKey: 'ding-app',
  appSecret: 'ding-secret',
  userId: 'user-id'
};

const secretHash = createHash('sha256').update(server.appSecret).digest('hex').slice(0, 12);
const logicalKey = `cache:dataset:dingtalk:accessToken:${server.appKey}:${secretHash}`;
const physicalKey = `fastgpt:${logicalKey}`;

describe('createDingtalkAccessTokenRepository', () => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };
  const logger = {
    warn: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(false);
  });

  it('preserves the physical key and dynamic TTL through the Redis adapter', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(0)
    };
    const adapter = createRedisStoreAdapter({ getCommandClient: () => commandClient as any });
    const repository = createDingtalkAccessTokenRepository({
      redis: adapter,
      logger
    });

    await expect(
      repository.getOrRefresh({
        server,
        fetchToken: async () => ({ accessToken: 'new-token', expireIn: 7200 })
      })
    ).resolves.toBe('new-token');

    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    expect(commandClient.set).toHaveBeenCalledWith(physicalKey, 'new-token', 'PX', 6_900_000);
  });

  it('returns a cached token without calling the upstream fetcher', async () => {
    redis.get.mockResolvedValue('cached-token');
    const fetchToken = vi.fn();
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    await expect(repository.getOrRefresh({ server, fetchToken })).resolves.toBe('cached-token');

    expect(fetchToken).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('preserves the historical empty-secret hash when appSecret is missing', async () => {
    redis.get.mockResolvedValue('cached-token');
    const emptySecretHash = createHash('sha256').update('').digest('hex').slice(0, 12);
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    await repository.getOrRefresh({
      server: { ...server, appSecret: undefined } as any,
      fetchToken: vi.fn()
    });

    expect(redis.get).toHaveBeenCalledWith(
      `cache:dataset:dingtalk:accessToken:${server.appKey}:${emptySecretHash}`
    );
  });

  it('uses the minimum TTL when the upstream expiry is inside the safety window', async () => {
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    await repository.getOrRefresh({
      server,
      fetchToken: async () => ({ accessToken: 'short-token', expireIn: 120 })
    });

    expect(redis.set).toHaveBeenCalledWith({
      key: logicalKey,
      value: 'short-token',
      ttlMs: 60_000
    });
  });

  it('continues refreshing when Redis read and write both fail', async () => {
    const readError = new Error('read failed');
    const writeError = new Error('write failed');
    redis.get.mockRejectedValue(readError);
    redis.set.mockRejectedValue(writeError);
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    await expect(
      repository.getOrRefresh({
        server,
        fetchToken: async () => ({ accessToken: 'new-token', expireIn: 7200 })
      })
    ).resolves.toBe('new-token');

    expect(logger.warn).toHaveBeenNthCalledWith(1, 'DingTalk accessToken cache read failed', {
      provider: 'dingtalk',
      appKey: server.appKey,
      error: readError
    });
    expect(logger.warn).toHaveBeenNthCalledWith(2, 'DingTalk accessToken cache write failed', {
      provider: 'dingtalk',
      appKey: server.appKey,
      ttl: 6900,
      error: writeError
    });
  });

  it('reuses one in-process refresh promise for concurrent misses', async () => {
    let resolveFetch: (value: { accessToken: string; expireIn: number }) => void = () => undefined;
    const fetchPromise = new Promise<{ accessToken: string; expireIn: number }>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchToken = vi.fn(() => fetchPromise);
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    const first = repository.getOrRefresh({ server, fetchToken });
    const second = repository.getOrRefresh({ server, fetchToken });
    resolveFetch({ accessToken: 'shared-token', expireIn: 7200 });

    await expect(Promise.all([first, second])).resolves.toEqual(['shared-token', 'shared-token']);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
  });

  it('deletes a stale token best-effort and preserves the upstream error', async () => {
    const upstreamError = new Error('upstream failed');
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    await expect(
      repository.getOrRefresh({
        server,
        fetchToken: async () => Promise.reject(upstreamError)
      })
    ).rejects.toBe(upstreamError);
    expect(redis.delete).toHaveBeenCalledWith(logicalKey);
  });

  it('preserves the upstream error when best-effort deletion also fails', async () => {
    const upstreamError = new Error('upstream failed');
    redis.delete.mockRejectedValue(new Error('delete failed'));
    const repository = createDingtalkAccessTokenRepository({ redis: redis as any, logger });

    await expect(
      repository.getOrRefresh({
        server,
        fetchToken: async () => Promise.reject(upstreamError)
      })
    ).rejects.toBe(upstreamError);
  });
});
