import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStreamResumeRepository,
  type StreamResumeRepositoryLogger
} from '@fastgpt/dal/redis/repositories';
import { asRedisLogicalKey } from '@fastgpt/dal/redis/adapter';

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
  rangeStream: vi.fn().mockResolvedValue([]),
  set: vi.fn().mockResolvedValue(undefined)
});

const logger: StreamResumeRepositoryLogger = {
  error: vi.fn()
};

describe('StreamResumeRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRepository = () =>
    createStreamResumeRepository({
      redis: createRedis(),
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

  it('keeps the historical logical key contract', () => {
    const repository = createRepository();

    expect(repository.getKeys(params)).toEqual({
      keyOfStream: asRedisLogicalKey('stream:resume:data:team-1:app:app-1:chat-1'),
      keyOfUnavailable: asRedisLogicalKey('stream:resume:unavailable:team-1:app:app-1:chat-1'),
      keyOfActive: asRedisLogicalKey('stream:resume:active:team-1:app:app-1:chat-1')
    });
  });

  it('parses valid state and treats malformed state as a miss', async () => {
    const redis = createRedis();
    const repository = createStreamResumeRepository({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

    redis.get.mockResolvedValueOnce('{"reason":"memoryPressure"}');
    await expect(repository.getUnavailable(params)).resolves.toEqual({
      reason: 'memoryPressure'
    });

    redis.get.mockResolvedValueOnce('{"updatedAt":0}');
    await expect(repository.getActive(params)).resolves.toBeUndefined();
    redis.get.mockResolvedValueOnce('{bad');
    await expect(repository.getUnavailable(params)).resolves.toBeUndefined();
  });

  it('clears old state before sequentially appending raw chunks and throttles touches', async () => {
    vi.useFakeTimers();
    try {
      const redis = createRedis();
      const repository = createStreamResumeRepository({
        redis,
        logger,
        streamTtlSeconds: 300,
        postCompleteTtlSeconds: 30,
        ttlTouchIntervalMs: 1_000
      });
      const mirror = repository.createMirror(params);

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
    const repository = createStreamResumeRepository({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });
    const mirror = repository.createMirror(params);

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

  it('delegates history range and blocking reader without exposing a Redis client', async () => {
    const redis = createRedis();
    const reader = {
      read: vi.fn().mockResolvedValue([{ id: '2-0', fields: { raw: 'data' } }]),
      close: vi.fn().mockResolvedValue(undefined)
    };
    redis.createBlockingStreamReader.mockReturnValue(reader);
    redis.rangeStream.mockResolvedValue([{ id: '1-0', fields: { raw: 'history' } }]);
    const repository = createStreamResumeRepository({
      redis,
      logger,
      streamTtlSeconds: 300,
      postCompleteTtlSeconds: 30,
      ttlTouchIntervalMs: 1_000
    });

    await expect(repository.range({ params, start: '-', end: '+', count: 50 })).resolves.toEqual([
      { id: '1-0', fields: { raw: 'history' } }
    ]);
    await expect(
      repository.withBlockingReader({
        params,
        blockMs: 30_000,
        count: 1,
        callback: (blockingReader) => blockingReader.read('$')
      })
    ).resolves.toEqual([{ id: '2-0', fields: { raw: 'data' } }]);

    await expect(
      repository.withBlockingReader({
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
    expect(() =>
      createStreamResumeRepository({
        logger,
        streamTtlSeconds: field === 'streamTtlSeconds' ? value : 300,
        postCompleteTtlSeconds: field === 'postCompleteTtlSeconds' ? value : 30,
        ttlTouchIntervalMs: field === 'ttlTouchIntervalMs' ? value : 1_000
      })
    ).toThrow(`streamResume.${field} must be a positive safe integer`);
  });
});
