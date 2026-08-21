import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OUTLINK_STREAM_CONTENT_TTL_SECONDS,
  OUTLINK_STREAM_END_FLAG,
  OUTLINK_STREAM_INITIAL_TTL_SECONDS,
  OutLinkStreamCache,
  getOutLinkStreamKey
} from '@fastgpt/dal/redis/caches';
import { asRedisLogicalKey, RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';

const streamId = 'stream-1';
const logicalKey = 'cache:streamResponse:stream-1';
const physicalKey = `fastgpt:${logicalKey}`;

describe('OutLinkStreamCache', () => {
  const redis = {
    appendStringWithTtl: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    setIfAbsent: vi.fn()
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.appendStringWithTtl.mockResolvedValue(0);
    redis.delete.mockResolvedValue(true);
    redis.get.mockResolvedValue(null);
    redis.setIfAbsent.mockResolvedValue(true);
  });

  it('preserves the historical logical key and stream protocol constants', () => {
    expect(getOutLinkStreamKey(streamId)).toBe(asRedisLogicalKey(logicalKey));
    expect(OUTLINK_STREAM_INITIAL_TTL_SECONDS).toBe(120);
    expect(OUTLINK_STREAM_CONTENT_TTL_SECONDS).toBe(60);
    expect(OUTLINK_STREAM_END_FLAG).toBe('[DONE]');
  });

  it('appends through one typed operation with the requested TTL', async () => {
    const cache = new OutLinkStreamCache({ redis });

    await expect(
      cache.append({
        streamId,
        value: 'hello',
        ttlSeconds: OUTLINK_STREAM_CONTENT_TTL_SECONDS
      })
    ).resolves.toBe(0);
    expect(redis.appendStringWithTtl).toHaveBeenCalledWith({
      key: asRedisLogicalKey(logicalKey),
      value: 'hello',
      ttlSeconds: OUTLINK_STREAM_CONTENT_TTL_SECONDS
    });
  });

  it('initializes an empty stream without replacing an existing response', async () => {
    const cache = new OutLinkStreamCache({ redis });

    await expect(
      cache.initializeIfAbsent({
        streamId,
        ttlSeconds: OUTLINK_STREAM_INITIAL_TTL_SECONDS
      })
    ).resolves.toBe(true);
    expect(redis.setIfAbsent).toHaveBeenCalledWith({
      key: asRedisLogicalKey(logicalKey),
      value: '',
      ttlSeconds: OUTLINK_STREAM_INITIAL_TTL_SECONDS
    });

    redis.setIfAbsent.mockResolvedValue(false);
    await expect(
      cache.initializeIfAbsent({
        streamId,
        ttlSeconds: OUTLINK_STREAM_INITIAL_TTL_SECONDS
      })
    ).resolves.toBe(false);
  });

  it('maps a Redis miss to undefined and deletes through the logical key', async () => {
    const cache = new OutLinkStreamCache({ redis });

    await expect(cache.get(streamId)).resolves.toBeUndefined();
    await expect(cache.delete(streamId)).resolves.toBe(true);
    expect(redis.get).toHaveBeenCalledWith(asRedisLogicalKey(logicalKey));
    expect(redis.delete).toHaveBeenCalledWith(asRedisLogicalKey(logicalKey));
  });

  it('preserves the physical key through the adapter', async () => {
    const commandClient = {
      append: vi.fn(),
      expire: vi.fn(),
      exec: vi.fn().mockResolvedValue([
        [null, 5],
        [null, 1]
      ]),
      multi: vi.fn()
    };
    const multi = {
      append: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: commandClient.exec
    };
    commandClient.multi.mockReturnValue(multi);
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new OutLinkStreamCache({ redis: adapter });

    await cache.append({ streamId, value: 'hello', ttlSeconds: 60 });

    expect(multi.append).toHaveBeenCalledWith(physicalKey, 'hello');
    expect(multi.expire).toHaveBeenCalledWith(physicalKey, 60);
  });

  it('rejects an empty stream id before Redis access', () => {
    const cache = new OutLinkStreamCache({ redis });

    expect(() => cache.getKey('')).toThrow();
    expect(redis.get).not.toHaveBeenCalled();
  });
});
