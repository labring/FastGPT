import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisCapabilities } from '@fastgpt/service/common/redis/capability';
import { createDingtalkAccessTokenStore } from '@fastgpt/service/common/redis/stores';

const server = {
  appKey: 'ding-app',
  appSecret: 'ding-secret',
  userId: 'user-id'
};

const secretHash = createHash('sha256').update(server.appSecret).digest('hex').slice(0, 12);
const logicalKey = `cache:dataset:dingtalk:accessToken:${server.appKey}:${secretHash}`;
const physicalKey = `fastgpt:${logicalKey}`;

describe('createDingtalkAccessTokenStore', () => {
  const stringStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };
  const logger = {
    warn: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stringStore.get.mockResolvedValue(null);
    stringStore.set.mockResolvedValue(undefined);
    stringStore.delete.mockResolvedValue(false);
  });

  it('preserves the physical key and dynamic TTL through the string capability', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(0)
    };
    const capabilities = createRedisCapabilities({
      getCommandClient: () => commandClient as any,
      createBlockingClient: vi.fn() as any
    });
    const store = createDingtalkAccessTokenStore({
      stringStore: capabilities.string,
      logger
    });

    await expect(
      store.getOrRefresh({
        server,
        fetchToken: async () => ({ accessToken: 'new-token', expireIn: 7200 })
      })
    ).resolves.toBe('new-token');

    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    expect(commandClient.set).toHaveBeenCalledWith(physicalKey, 'new-token', 'PX', 6_900_000);
  });

  it('returns a cached token without calling the upstream fetcher', async () => {
    stringStore.get.mockResolvedValue('cached-token');
    const fetchToken = vi.fn();
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    await expect(store.getOrRefresh({ server, fetchToken })).resolves.toBe('cached-token');

    expect(fetchToken).not.toHaveBeenCalled();
    expect(stringStore.set).not.toHaveBeenCalled();
  });

  it('preserves the historical empty-secret hash when appSecret is missing', async () => {
    stringStore.get.mockResolvedValue('cached-token');
    const emptySecretHash = createHash('sha256').update('').digest('hex').slice(0, 12);
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    await store.getOrRefresh({
      server: { ...server, appSecret: undefined } as any,
      fetchToken: vi.fn()
    });

    expect(stringStore.get).toHaveBeenCalledWith(
      `cache:dataset:dingtalk:accessToken:${server.appKey}:${emptySecretHash}`
    );
  });

  it('uses the minimum TTL when the upstream expiry is inside the safety window', async () => {
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    await store.getOrRefresh({
      server,
      fetchToken: async () => ({ accessToken: 'short-token', expireIn: 120 })
    });

    expect(stringStore.set).toHaveBeenCalledWith({
      key: logicalKey,
      value: 'short-token',
      ttlMs: 60_000
    });
  });

  it('continues refreshing when Redis read and write both fail', async () => {
    const readError = new Error('read failed');
    const writeError = new Error('write failed');
    stringStore.get.mockRejectedValue(readError);
    stringStore.set.mockRejectedValue(writeError);
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    await expect(
      store.getOrRefresh({
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
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    const first = store.getOrRefresh({ server, fetchToken });
    const second = store.getOrRefresh({ server, fetchToken });
    resolveFetch({ accessToken: 'shared-token', expireIn: 7200 });

    await expect(Promise.all([first, second])).resolves.toEqual(['shared-token', 'shared-token']);
    expect(fetchToken).toHaveBeenCalledTimes(1);
    expect(stringStore.set).toHaveBeenCalledTimes(1);
  });

  it('deletes a stale token best-effort and preserves the upstream error', async () => {
    const upstreamError = new Error('upstream failed');
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    await expect(
      store.getOrRefresh({
        server,
        fetchToken: async () => Promise.reject(upstreamError)
      })
    ).rejects.toBe(upstreamError);
    expect(stringStore.delete).toHaveBeenCalledWith(logicalKey);
  });

  it('preserves the upstream error when best-effort deletion also fails', async () => {
    const upstreamError = new Error('upstream failed');
    stringStore.delete.mockRejectedValue(new Error('delete failed'));
    const store = createDingtalkAccessTokenStore({ stringStore: stringStore as any, logger });

    await expect(
      store.getOrRefresh({
        server,
        fetchToken: async () => Promise.reject(upstreamError)
      })
    ).rejects.toBe(upstreamError);
  });
});
