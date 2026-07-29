import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WECHAT_POLLING_FAILURE_TTL_SECONDS,
  WechatPollingFailureCache,
  getWechatPollingFailureKey
} from '@fastgpt/dal/redis/caches';
import { asRedisLogicalKey, createRedisCacheAdapter } from '@fastgpt/dal/redis/adapter';

const shareId = 'share-1';
const logicalKey = 'cache:wechat:publish:failures:share-1';
const physicalKey = `fastgpt:${logicalKey}`;

describe('WechatPollingFailureCache', () => {
  const redis = {
    delete: vi.fn(),
    incrementIntegerWithTtl: vi.fn(),
    set: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.delete.mockResolvedValue(true);
    redis.incrementIntegerWithTtl.mockResolvedValue(1);
    redis.set.mockResolvedValue(undefined);
  });

  it('preserves the historical key and 300 second TTL', () => {
    expect(getWechatPollingFailureKey(shareId)).toBe(asRedisLogicalKey(logicalKey));
    expect(WECHAT_POLLING_FAILURE_TTL_SECONDS).toBe(300);
  });

  it('increments atomically through the integer adapter', async () => {
    const cache = new WechatPollingFailureCache({ redis });

    await expect(cache.increment(shareId)).resolves.toBe(1);
    expect(redis.incrementIntegerWithTtl).toHaveBeenCalledWith({
      key: asRedisLogicalKey(logicalKey),
      increment: 1,
      ttlSeconds: 300
    });
  });

  it('resets to zero with the historical TTL and clears after threshold', async () => {
    const cache = new WechatPollingFailureCache({ redis });

    await cache.reset(shareId);
    await expect(cache.clear(shareId)).resolves.toBe(true);

    expect(redis.set).toHaveBeenCalledWith({
      key: asRedisLogicalKey(logicalKey),
      value: '0',
      ttlMs: 300_000
    });
    expect(redis.delete).toHaveBeenCalledWith(asRedisLogicalKey(logicalKey));
  });

  it('preserves the physical key through the adapter', async () => {
    const commandClient = {
      multi: vi.fn()
    };
    const multi = {
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 3],
        [null, 1]
      ])
    };
    commandClient.multi.mockReturnValue(multi);
    const adapter = createRedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new WechatPollingFailureCache({ redis: adapter });

    await expect(cache.increment(shareId)).resolves.toBe(3);

    expect(multi.incrby).toHaveBeenCalledWith(physicalKey, 1);
    expect(multi.expire).toHaveBeenCalledWith(physicalKey, 300, 'NX');
  });

  it('rejects an empty share id before Redis access', () => {
    const cache = new WechatPollingFailureCache({ redis });

    expect(() => cache.increment('')).toThrow();
    expect(redis.incrementIntegerWithTtl).not.toHaveBeenCalled();
  });
});
