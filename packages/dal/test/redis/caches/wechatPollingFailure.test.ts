import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WECHAT_POLLING_FAILURE_TTL_SECONDS,
  WechatPollingFailureCache,
  getWechatPollingFailureKey
} from '@fastgpt/dal/redis/caches';
import { asRedisLogicalKey, RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';

const shareId = 'share-1';
const bindingKey = 'binding-1';
const logicalKey = 'cache:wechat:publish:failures:share-1:binding-1';
const physicalKey = `fastgpt:${logicalKey}`;

describe('WechatPollingFailureCache', () => {
  const redis = {
    delete: vi.fn(),
    incrementIntegerWithTtl: vi.fn()
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    redis.delete.mockResolvedValue(true);
    redis.incrementIntegerWithTtl.mockResolvedValue(1);
  });

  it('uses separate keys per binding and keeps the 300 second TTL', () => {
    expect(getWechatPollingFailureKey(shareId, bindingKey)).toBe(asRedisLogicalKey(logicalKey));
    expect(getWechatPollingFailureKey(shareId, 'binding-2')).not.toBe(logicalKey);
    expect(WECHAT_POLLING_FAILURE_TTL_SECONDS).toBe(300);
  });

  it('increments atomically through the integer adapter', async () => {
    const cache = new WechatPollingFailureCache({ redis });

    await expect(cache.increment(shareId, bindingKey)).resolves.toBe(1);
    expect(redis.incrementIntegerWithTtl).toHaveBeenCalledWith({
      key: asRedisLogicalKey(logicalKey),
      increment: 1,
      ttlSeconds: 300
    });
  });

  it('removes the counter so the next failure starts a new window', async () => {
    const cache = new WechatPollingFailureCache({ redis });

    await expect(cache.clear(shareId, bindingKey)).resolves.toBe(true);

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
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new WechatPollingFailureCache({ redis: adapter });

    await expect(cache.increment(shareId, bindingKey)).resolves.toBe(3);

    expect(multi.incrby).toHaveBeenCalledWith(physicalKey, 1);
    expect(multi.expire).toHaveBeenCalledWith(physicalKey, 300, 'NX');
  });

  it('rejects an empty share id before Redis access', () => {
    const cache = new WechatPollingFailureCache({ redis });

    expect(() => cache.increment('', bindingKey)).toThrow();
    expect(redis.incrementIntegerWithTtl).not.toHaveBeenCalled();
  });
});
