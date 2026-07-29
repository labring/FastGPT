import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamResumeCache } from '@fastgpt/dal/redis/caches';
import { asRedisLogicalKey } from '@fastgpt/dal/redis/adapter';
import type { RedisCacheLogger } from '@fastgpt/dal/redis/types';

const params = {
  teamId: 'team-1',
  sourceType: 'app',
  sourceId: 'app-1',
  chatId: 'chat-1'
};

const createRedis = () => ({
  appendStreamEntry: vi.fn().mockResolvedValue('1-0'),
  createBlockingStreamReader: vi.fn(),
  delete: vi.fn().mockResolvedValue(false),
  expireStream: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue(null),
  getMemoryInfo: vi.fn().mockResolvedValue({}),
  rangeStream: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockResolvedValue(undefined)
});

const logger: RedisCacheLogger<'error'> = {
  error: vi.fn()
};

describe('StreamResumeCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createCache = () =>
    new StreamResumeCache({
      redis: createRedis(),
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

  it('keeps the historical logical key contract', () => {
    const cache = createCache();

    expect(cache.getKeys(params)).toEqual({
      keyOfStream: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
      keyOfUnavailable: asRedisLogicalKey('stream:resume:unavailable:team-1:app:app-1:chat-1'),
      keyOfActive: asRedisLogicalKey('stream:resume:active:team-1:app:app-1:chat-1')
    });
  });

  it('parses valid state and treats malformed state as a miss', async () => {
    const redis = createRedis();
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

    redis.get.mockResolvedValueOnce('{"reason":"memoryPressure"}');
    await expect(cache.getUnavailable(params)).resolves.toEqual({
      reason: 'memoryPressure'
    });

    redis.get.mockResolvedValueOnce('{"updatedAt":0}');
    await expect(cache.getActive(params)).resolves.toBeUndefined();
    redis.get.mockResolvedValueOnce('{bad');
    await expect(cache.getUnavailable(params)).resolves.toBeUndefined();
    redis.get.mockResolvedValueOnce('{bad');
    await expect(cache.getActive(params)).resolves.toBeUndefined();

    await cache.setUnavailable(params, { reason: 'memoryPressure' });
    expect(redis.set).toHaveBeenCalledWith({
      key: asRedisLogicalKey('stream:resume:unavailable:team-1:app:app-1:chat-1'),
      value: JSON.stringify({ reason: 'memoryPressure' }),
      ttlMs: 300_000
    });
  });

  it('exposes typed Redis memory info without exposing a client', async () => {
    const redis = createRedis();
    redis.getMemoryInfo.mockResolvedValue({ usedMemory: 42, maxMemory: 100 });
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

    await expect(cache.getMemoryInfo()).resolves.toEqual({ usedMemory: 42, maxMemory: 100 });
    expect(redis.getMemoryInfo).toHaveBeenCalledTimes(1);
  });

  it('clears old state before sequentially appending raw chunks and throttles touches', async () => {
    vi.useFakeTimers();
    try {
      const redis = createRedis();
      const cache = new StreamResumeCache({
        redis,
        logger,
        streamTtlSeconds: 300,
        postCompleteTtlSeconds: 30,
        ttlTouchIntervalMs: 1_000
      });
      const mirror = cache.createMirror(params);

      await mirror.enqueueRaw('first');
      await mirror.enqueueRaw('second');
      await mirror.flush();

      expect(redis.delete).toHaveBeenCalledTimes(3);
      expect(redis.appendStreamEntry).toHaveBeenNthCalledWith(1, {
        key: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
        fields: { raw: 'first' }
      });
      expect(redis.appendStreamEntry).toHaveBeenNthCalledWith(2, {
        key: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
        fields: { raw: 'second' }
      });
      expect(redis.expireStream).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      await mirror.enqueueRaw('third');
      await mirror.flush();
      expect(redis.expireStream).toHaveBeenCalledTimes(2);
      expect(redis.set).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shrinks stream and active state TTL after completion', async () => {
    const redis = createRedis();
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });
    const mirror = cache.createMirror(params);

    await mirror.shrinkTTLAfterComplete();

    expect(redis.expireStream).toHaveBeenNthCalledWith(1, {
      key: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
      ttlSeconds: 30
    });
    expect(redis.expireStream).toHaveBeenNthCalledWith(2, {
      key: asRedisLogicalKey('stream:resume:active:team-1:app:app-1:chat-1'),
      ttlSeconds: 30
    });
  });

  it('logs a failed mirror cleanup and continues with the write queue', async () => {
    const redis = createRedis();
    const clearError = new Error('cleanup failed');
    redis.delete.mockRejectedValueOnce(clearError);
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });
    const mirror = cache.createMirror(params);

    await mirror.enqueueRaw('after-cleanup');
    await mirror.flush();

    expect(redis.appendStreamEntry).toHaveBeenCalledWith({
      key: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
      fields: { raw: 'after-cleanup' }
    });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to clear stream resume redis keys before mirror',
      expect.objectContaining({ params, error: clearError })
    );
  });

  it('logs failed mirror writes and allows later writes to continue', async () => {
    const redis = createRedis();
    const writeError = new Error('mirror write failed');
    redis.appendStreamEntry.mockRejectedValueOnce(writeError);
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });
    const mirror = cache.createMirror(params);

    await mirror.enqueueRaw('failed');
    await mirror.enqueueRaw('recovered');
    await mirror.flush();

    expect(redis.appendStreamEntry).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to mirror stream response to redis',
      expect.objectContaining({ params, error: writeError })
    );
  });

  it('logs TTL shrink failures without rejecting completion', async () => {
    const redis = createRedis();
    const ttlError = new Error('ttl update failed');
    redis.expireStream.mockRejectedValueOnce(ttlError);
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });
    const mirror = cache.createMirror(params);

    await expect(mirror.shrinkTTLAfterComplete()).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to shrink stream resume redis ttl',
      expect.objectContaining({ params, error: ttlError })
    );
  });

  it('delegates history range and blocking reader without exposing a Redis client', async () => {
    const redis = createRedis();
    const reader = {
      read: vi.fn().mockResolvedValue([{ id: '2-0', fields: { raw: 'data' } }]),
      close: vi.fn().mockResolvedValue(undefined)
    };
    redis.createBlockingStreamReader.mockReturnValue(reader);
    redis.rangeStream.mockResolvedValue([{ id: '1-0', fields: { raw: 'history' } }]);
    const cache = new StreamResumeCache({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

    await expect(cache.range({ params, start: '-', end: '+', count: 50 })).resolves.toEqual([
      { id: '1-0', fields: { raw: 'history' } }
    ]);
    await expect(
      cache.withBlockingReader({
        params,
        blockMs: 30_000,
        count: 1,
        callback: (blockingReader) => blockingReader.read('$')
      })
    ).resolves.toEqual([{ id: '2-0', fields: { raw: 'data' } }]);

    await expect(
      cache.withBlockingReader({
        params,
        blockMs: 30_000,
        callback: () => {
          throw new Error('reader failed');
        }
      })
    ).rejects.toThrow('reader failed');

    expect(redis.rangeStream).toHaveBeenCalledWith({
      key: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
      start: '-',
      end: '+',
      count: 50
    });
    expect(redis.createBlockingStreamReader).toHaveBeenCalledWith({
      key: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
      blockMs: 30_000,
      count: 1
    });
    expect(reader.close).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['streamTtlSeconds', 0],
    ['postCompleteTtlSeconds', -1],
    ['ttlTouchIntervalMs', 1.5]
  ])('rejects invalid %s configuration', (field, value) => {
    expect(
      () =>
        new StreamResumeCache({
          logger,
          streamTtlSeconds: field === 'streamTtlSeconds' ? value : 300,
          postCompleteTtlSeconds: field === 'postCompleteTtlSeconds' ? value : 30,
          ttlTouchIntervalMs: field === 'ttlTouchIntervalMs' ? value : 1_000
        })
    ).toThrow(`streamResume.${field} must be a positive safe integer`);
  });
});
