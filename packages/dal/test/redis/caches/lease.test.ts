import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asRedisLogicalKey, RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import {
  LeaseCache,
  isRedisLeaseError,
  RedisLeaseAcquireError,
  RedisLeaseLostError,
  RedisLeaseUnavailableError
} from '@fastgpt/dal/redis/caches';
import { RedisLeaseWaitTimeoutError } from '@fastgpt/dal/redis/caches/lease';

const key = asRedisLogicalKey('lock:agent-sandbox:init:sandbox-1');

describe('LeaseCache', () => {
  const logger = { warn: vi.fn() };
  const redis = {
    acquireLease: vi.fn(),
    releaseLease: vi.fn(),
    renewLease: vi.fn()
  } as any;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    redis.acquireLease.mockResolvedValue(true);
    redis.releaseLease.mockResolvedValue(true);
    redis.renewLease.mockResolvedValue(true);
  });

  it('acquires, renews and releases a lease around the critical section', async () => {
    vi.useFakeTimers();
    let resolveWork!: () => void;
    const work = new Promise<string>((resolve) => {
      resolveWork = () => resolve('ok');
    });
    const cache = new LeaseCache({ redis, logger });

    const resultPromise = cache.withLease({
      key: 'agent-sandbox:init:sandbox-1',
      label: 'agent-sandbox-init',
      ttlMs: 60,
      renewIntervalMs: 10,
      fn: () => work
    });

    await Promise.resolve();
    expect(redis.acquireLease).toHaveBeenCalledWith({
      key,
      token: expect.any(String),
      ttlMs: 60
    });
    await vi.advanceTimersByTimeAsync(25);
    expect(redis.renewLease).toHaveBeenCalledWith({
      key,
      token: expect.any(String),
      ttlMs: 60
    });

    resolveWork();
    await expect(resultPromise).resolves.toBe('ok');
    expect(redis.releaseLease).toHaveBeenCalledWith({ key, token: expect.any(String) });
  });

  it('does not run when another holder owns the lease', async () => {
    redis.acquireLease.mockResolvedValue(false);
    const work = vi.fn();
    const cache = new LeaseCache({ redis, logger });

    await expect(
      cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60_000,
        fn: work
      })
    ).rejects.toBeInstanceOf(RedisLeaseUnavailableError);
    expect(work).not.toHaveBeenCalled();
    expect(redis.releaseLease).not.toHaveBeenCalled();
  });

  it('fails closed when renewal reports a replaced token', async () => {
    vi.useFakeTimers();
    redis.renewLease.mockResolvedValue(false);
    let resolveWork!: () => void;
    const work = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });
    const cache = new LeaseCache({ redis, logger });
    const resultPromise = cache.withLease({
      key: 'agent-sandbox:init:sandbox-1',
      label: 'agent-sandbox-init',
      ttlMs: 60,
      renewIntervalMs: 10,
      fn: () => work
    });

    await Promise.resolve();
    expect(redis.acquireLease).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(25);
    resolveWork();

    await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
    expect(logger.warn).toHaveBeenCalledWith(
      'Redis lease renew failed because token no longer matches',
      expect.objectContaining({ key, label: 'agent-sandbox-init' })
    );
  });

  it('marks the lease lost when renewal errors continue past its expiry', async () => {
    vi.useFakeTimers();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      redis.renewLease.mockRejectedValue(new Error('renew unavailable'));
      let resolveWork!: () => void;
      const work = new Promise<void>((resolve) => {
        resolveWork = resolve;
      });
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60,
        renewIntervalMs: 10,
        fn: () => work
      });

      await Promise.resolve();
      expect(redis.acquireLease).toHaveBeenCalled();
      nowSpy.mockReturnValue(1_000);
      await vi.advanceTimersByTimeAsync(10);
      resolveWork();

      await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis lease renew failed',
        expect.objectContaining({ key, label: 'agent-sandbox-init', error: expect.any(Error) })
      );
      expect(redis.releaseLease).toHaveBeenCalledWith({ key, token: expect.any(String) });
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('ignores a renewal that resolves after the critical section has ended', async () => {
    vi.useFakeTimers();
    try {
      let resolveRenew!: (value: boolean) => void;
      redis.renewLease.mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveRenew = resolve;
        })
      );
      let resolveWork!: () => void;
      const work = new Promise<string>((resolve) => {
        resolveWork = () => resolve('ok');
      });
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60,
        renewIntervalMs: 10,
        fn: () => work
      });

      await Promise.resolve();
      expect(redis.acquireLease).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10);
      resolveWork();
      await expect(resultPromise).resolves.toBe('ok');
      resolveRenew(true);
      await vi.runAllTicks();

      expect(redis.releaseLease).toHaveBeenCalledWith({ key, token: expect.any(String) });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not overlap renewal requests when Redis is slower than the interval', async () => {
    vi.useFakeTimers();
    try {
      let resolveRenew!: (value: boolean) => void;
      redis.renewLease.mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveRenew = resolve;
        })
      );
      let resolveWork!: () => void;
      const work = new Promise<string>((resolve) => {
        resolveWork = () => resolve('ok');
      });
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60,
        renewIntervalMs: 10,
        fn: () => work
      });

      await Promise.resolve();
      expect(redis.acquireLease).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(35);
      expect(redis.renewLease).toHaveBeenCalledTimes(1);

      resolveRenew(true);
      await vi.runAllTicks();
      resolveWork();
      await expect(resultPromise).resolves.toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the lease lost when a renewal hangs past expiry', async () => {
    vi.useFakeTimers();
    try {
      let resolveRenew!: (value: boolean) => void;
      redis.renewLease.mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveRenew = resolve;
        })
      );
      let resolveWork!: () => void;
      let leaseSignal!: AbortSignal;
      const work = new Promise<void>((resolve) => {
        resolveWork = resolve;
      });
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 20,
        renewIntervalMs: 5,
        fn: ({ signal }) => {
          leaseSignal = signal;
          return work;
        }
      });

      await Promise.resolve();
      expect(redis.acquireLease).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5);
      await vi.advanceTimersByTimeAsync(15);

      expect(leaseSignal.aborted).toBe(true);
      resolveRenew(true);
      await vi.runAllTicks();
      resolveWork();
      await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not enter the critical section after a slow acquisition expires locally', async () => {
    vi.useFakeTimers();
    try {
      let resolveAcquire!: (value: boolean) => void;
      redis.acquireLease.mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveAcquire = resolve;
        })
      );
      const work = vi.fn(async () => undefined);
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 20,
        renewIntervalMs: 5,
        fn: work
      });

      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(25);
      resolveAcquire(true);

      await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
      expect(work).not.toHaveBeenCalled();
      expect(redis.releaseLease).toHaveBeenCalledWith({ key, token: expect.any(String) });
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses a one millisecond default renewal interval for short leases', async () => {
    vi.useFakeTimers();
    try {
      let resolveWork!: () => void;
      const work = new Promise<void>((resolve) => {
        resolveWork = resolve;
      });
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 5,
        fn: () => work
      });

      await Promise.resolve();
      expect(redis.acquireLease).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(redis.renewLease).toHaveBeenCalledTimes(1);

      resolveWork();
      await expect(resultPromise).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the lease while a transient renewal error occurs before expiry', async () => {
    vi.useFakeTimers();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(0);
    try {
      redis.renewLease.mockRejectedValueOnce(new Error('temporary renewal failure'));
      let resolveWork!: () => void;
      const work = new Promise<string>((resolve) => {
        resolveWork = () => resolve('ok');
      });
      const cache = new LeaseCache({ redis, logger });
      const resultPromise = cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60,
        renewIntervalMs: 10,
        fn: () => work
      });

      await Promise.resolve();
      expect(redis.acquireLease).toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10);
      resolveWork();

      await expect(resultPromise).resolves.toBe('ok');
      expect(logger.warn).toHaveBeenCalledWith(
        'Redis lease renew failed',
        expect.objectContaining({ key, label: 'agent-sandbox-init' })
      );
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('wraps acquire errors and keeps release best-effort', async () => {
    const acquireError = new Error('redis unavailable');
    redis.acquireLease.mockRejectedValue(acquireError);
    const cache = new LeaseCache({ redis, logger });

    await expect(
      cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60_000,
        fn: async () => 'never'
      })
    ).rejects.toMatchObject({
      name: 'RedisLeaseAcquireError',
      cause: acquireError
    });
    expect(redis.releaseLease).not.toHaveBeenCalled();

    redis.acquireLease.mockResolvedValue(true);
    redis.releaseLease.mockRejectedValue(new Error('release failed'));
    await expect(
      cache.withLease({
        key: 'agent-sandbox:init:sandbox-1',
        label: 'agent-sandbox-init',
        ttlMs: 60_000,
        fn: async () => 'ok'
      })
    ).resolves.toBe('ok');
    expect(logger.warn).toHaveBeenCalledWith(
      'Redis lease release failed',
      expect.objectContaining({ key, label: 'agent-sandbox-init' })
    );
  });

  it.each([
    [{ key: '', ttlMs: 60_000 }, 'key must be a non-empty string'],
    [{ key: 'lease', ttlMs: 0 }, 'ttlMs must be a positive safe integer'],
    [{ key: 'lease', ttlMs: 60, renewIntervalMs: 60 }, 'renewIntervalMs must be smaller than ttlMs']
  ])('rejects invalid lease options %#', async (input, message) => {
    const cache = new LeaseCache({ redis, logger });

    await expect(
      cache.withLease({
        ...input,
        label: 'lease',
        fn: async () => undefined
      } as any)
    ).rejects.toThrow(message);
    expect(redis.acquireLease).not.toHaveBeenCalled();
  });

  it('recognizes only lease coordination errors for service mapping', () => {
    expect(isRedisLeaseError(new RedisLeaseUnavailableError({ key, label: 'lease' }))).toBe(true);
    expect(isRedisLeaseError(new RedisLeaseLostError({ key, label: 'lease' }))).toBe(true);
    expect(
      isRedisLeaseError(new RedisLeaseAcquireError({ key, label: 'lease', cause: null }))
    ).toBe(true);
    expect(isRedisLeaseError(new Error('other failure'))).toBe(false);
  });
});

describe('LeaseCache.withConcurrency', () => {
  const held = new Map<string, string>();
  const logger = { warn: vi.fn() };
  const redis = {
    acquireLease: vi.fn(),
    releaseLease: vi.fn(),
    renewLease: vi.fn()
  } as any;
  const options = {
    key: 'vector:pg:recall',
    label: 'vector-recall',
    concurrency: 2,
    ttlMs: 100,
    renewIntervalMs: 10,
    retryIntervalMs: 5,
    waitTimeoutMs: 500
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    held.clear();
    redis.acquireLease.mockImplementation(
      async ({ key, token }: { key: string; token: string }) => {
        if (held.has(key)) return false;
        held.set(key, token);
        return true;
      }
    );
    redis.renewLease.mockImplementation(
      async ({ key, token }: { key: string; token: string }) => held.get(key) === token
    );
    redis.releaseLease.mockImplementation(
      async ({ key, token }: { key: string; token: string }) => {
        if (held.get(key) !== token) return false;
        held.delete(key);
        return true;
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shares slots across instances, waits for release and renews running tasks', async () => {
    const caches = [new LeaseCache({ redis, logger }), new LeaseCache({ redis, logger })];
    let active = 0;
    let peak = 0;
    const work = vi.fn(async (index: number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 25));
      active--;
      return index;
    });
    const result = Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        caches[index % 2].withConcurrency({ ...options, fn: () => work(index) })
      )
    );

    await vi.advanceTimersByTimeAsync(100);

    await expect(result).resolves.toEqual([0, 1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(work).toHaveBeenCalledTimes(6);
    expect(redis.renewLease).toHaveBeenCalled();
    expect(held.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps different resource keys independent and provides default wait settings', async () => {
    const cache = new LeaseCache({ redis, logger });
    const result = Promise.all(
      ['resource-a', 'resource-b'].map((key) =>
        cache.withConcurrency({
          key,
          label: key,
          concurrency: 1,
          ttlMs: 100,
          fn: async ({ assertValid }) => {
            assertValid();
            return held.size;
          }
        })
      )
    );

    await expect(result).resolves.toEqual([2, 2]);
    expect(held.size).toBe(0);
  });

  it('times out waiting for busy slots without running the callback', async () => {
    redis.acquireLease.mockResolvedValue(false);
    const fn = vi.fn();
    const cache = new LeaseCache({ redis, logger });
    const result = expect(
      cache.withConcurrency({
        ...options,
        waitTimeoutMs: 25,
        retryIntervalMs: 10,
        fn
      })
    ).rejects.toBeInstanceOf(RedisLeaseWaitTimeoutError);

    await vi.advanceTimersByTimeAsync(25);
    await result;

    expect(fn).not.toHaveBeenCalled();
    expect(redis.acquireLease).toHaveBeenCalledTimes(6);
    expect(vi.getTimerCount()).toBe(0);
    expect(isRedisLeaseError(new RedisLeaseWaitTimeoutError(options))).toBe(true);
  });

  it('releases a slot acquired after the wait deadline without starting work', async () => {
    let resolveAcquire!: (value: boolean) => void;
    redis.acquireLease.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveAcquire = resolve;
      })
    );
    const fn = vi.fn();
    const cache = new LeaseCache({ redis, logger });
    const result = expect(
      cache.withConcurrency({
        ...options,
        waitTimeoutMs: 20,
        fn
      })
    ).rejects.toBeInstanceOf(RedisLeaseWaitTimeoutError);

    await vi.advanceTimersByTimeAsync(25);
    resolveAcquire(true);
    await result;

    expect(fn).not.toHaveBeenCalled();
    expect(redis.releaseLease).toHaveBeenCalledOnce();
  });

  it('does not retry business errors even if they look like a busy lease', async () => {
    const error = new RedisLeaseUnavailableError(options);
    const fn = vi.fn().mockRejectedValue(error);
    const cache = new LeaseCache({ redis, logger });

    await expect(cache.withConcurrency({ ...options, fn })).rejects.toBe(error);

    expect(fn).toHaveBeenCalledOnce();
    expect(redis.acquireLease).toHaveBeenCalledOnce();
    expect(held.size).toBe(0);
    await expect(cache.withConcurrency({ ...options, fn: async () => 'next' })).resolves.toBe(
      'next'
    );
  });

  it('fails closed on Redis errors rather than bypassing the concurrency limit', async () => {
    redis.acquireLease.mockRejectedValue(new Error('Redis unavailable'));
    const fn = vi.fn();
    const cache = new LeaseCache({ redis, logger });

    await expect(cache.withConcurrency({ ...options, fn })).rejects.toBeInstanceOf(
      RedisLeaseAcquireError
    );

    expect(fn).not.toHaveBeenCalled();
    expect(redis.acquireLease).toHaveBeenCalledOnce();
  });

  it('cancels queued work and removes its retry timer', async () => {
    redis.acquireLease.mockResolvedValue(false);
    const controller = new AbortController();
    const error = new Error('request cancelled');
    const fn = vi.fn();
    const cache = new LeaseCache({ redis, logger });
    const result = expect(
      cache.withConcurrency({
        ...options,
        signal: controller.signal,
        fn
      })
    ).rejects.toBe(error);
    await vi.advanceTimersByTimeAsync(0);

    controller.abort(error);
    await result;

    expect(fn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not acquire for an already aborted caller', async () => {
    const controller = new AbortController();
    const error = new Error('already cancelled');
    controller.abort(error);
    const cache = new LeaseCache({ redis, logger });

    await expect(
      cache.withConcurrency({
        ...options,
        signal: controller.signal,
        fn: vi.fn()
      })
    ).rejects.toBe(error);

    expect(redis.acquireLease).not.toHaveBeenCalled();
  });

  it('forwards caller cancellation to running work and releases its slot', async () => {
    const controller = new AbortController();
    const error = new Error('cancelled while running');
    const cache = new LeaseCache({ redis, logger });

    await expect(
      cache.withConcurrency({
        ...options,
        signal: controller.signal,
        fn: async ({ signal, assertValid }) => {
          expect(signal.aborted).toBe(false);
          controller.abort(error);
          expect(signal.aborted).toBe(true);
          expect(() => assertValid()).toThrow(error);
          return 'discarded';
        }
      })
    ).rejects.toBe(error);

    expect(held.size).toBe(0);
  });

  it('forwards lease loss without retrying the task in another slot', async () => {
    redis.renewLease.mockResolvedValue(false);
    const cache = new LeaseCache({ redis, logger });
    const fn = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        })
    );
    const result = expect(cache.withConcurrency({ ...options, fn })).rejects.toBeInstanceOf(
      RedisLeaseLostError
    );

    await vi.advanceTimersByTimeAsync(10);
    await result;

    expect(fn).toHaveBeenCalledOnce();
    expect(held.size).toBe(0);
  });

  it.each([
    [{ concurrency: 0 }, 'concurrency'],
    [{ concurrency: 1.5 }, 'concurrency'],
    [{ waitTimeoutMs: 0 }, 'waitTimeoutMs'],
    [{ retryIntervalMs: 0 }, 'retryIntervalMs'],
    [{ key: '' }, 'key'],
    [{ ttlMs: 0 }, 'ttlMs'],
    [{ renewIntervalMs: 100 }, 'renewIntervalMs']
  ])('validates concurrency options before touching Redis %#', async (invalid, field) => {
    const cache = new LeaseCache({ redis, logger });

    await expect(cache.withConcurrency({ ...options, ...invalid, fn: vi.fn() })).rejects.toThrow(
      field
    );
    expect(redis.acquireLease).not.toHaveBeenCalled();
  });
});

describe('Lease adapter operations', () => {
  const client = {
    del: vi.fn(),
    eval: vi.fn(),
    get: vi.fn(),
    hgetall: vi.fn(),
    multi: vi.fn(),
    scan: vi.fn(),
    set: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the physical key for acquire, renew and release', async () => {
    client.set.mockResolvedValue('OK');
    client.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });

    await expect(adapter.acquireLease({ key, token: 'token-1', ttlMs: 60_000 })).resolves.toBe(
      true
    );
    await expect(adapter.renewLease({ key, token: 'token-1', ttlMs: 60_000 })).resolves.toBe(true);
    await expect(adapter.releaseLease({ key, token: 'token-1' })).resolves.toBe(true);

    expect(client.set).toHaveBeenCalledWith(
      'fastgpt:lock:agent-sandbox:init:sandbox-1',
      'token-1',
      'PX',
      60_000,
      'NX'
    );
    expect(client.eval).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('pexpire'),
      1,
      'fastgpt:lock:agent-sandbox:init:sandbox-1',
      'token-1',
      '60000'
    );
    expect(client.eval).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('del'),
      1,
      'fastgpt:lock:agent-sandbox:init:sandbox-1',
      'token-1'
    );
  });

  it('accepts a missing lease as a normal acquire miss', async () => {
    client.set.mockResolvedValue(null);
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });

    await expect(adapter.acquireLease({ key, token: 'token-1', ttlMs: 60 })).resolves.toBe(false);
  });

  it.each(['invalid', 2])('rejects malformed lease command responses %#', async (result) => {
    client.set.mockResolvedValue(result);
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });
    await expect(adapter.acquireLease({ key, token: 'token-1', ttlMs: 60 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'lease.acquire'
    });

    client.eval.mockResolvedValue(result);
    await expect(adapter.renewLease({ key, token: 'token-1', ttlMs: 60 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'lease.renew'
    });

    client.eval.mockResolvedValue(result);
    await expect(adapter.releaseLease({ key, token: 'token-1' })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'lease.release'
    });
  });

  it.each([
    [{ token: '', ttlMs: 60 }, 'token must be a non-empty string'],
    [{ token: 'token-1', ttlMs: 0 }, 'ttlMs must be a positive safe integer']
  ])('rejects invalid adapter arguments %#', (input, message) => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.acquireLease({ key, ...input } as any)).toThrow(message);
    expect(client.set).not.toHaveBeenCalled();
  });

  it('rejects an empty renew token before evaluating the renew script', () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.renewLease({ key, token: '', ttlMs: 60 })).toThrow(
      'token must be a non-empty string'
    );
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('rejects an empty release token before evaluating the release script', () => {
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.releaseLease({ key, token: '' })).toThrow(
      'token must be a non-empty string'
    );
    expect(client.eval).not.toHaveBeenCalled();
  });

  it('maps logical keys and rejects non-finite script arguments', async () => {
    client.eval.mockResolvedValue('ok');
    const adapter = new RedisCacheAdapter({ getCommandClient: () => client as any });

    await expect(
      adapter.evalScript({ script: 'return ARGV[1]', keys: [key], args: ['value', 42] })
    ).resolves.toBe('ok');
    expect(client.eval).toHaveBeenCalledWith(
      'return ARGV[1]',
      1,
      'fastgpt:lock:agent-sandbox:init:sandbox-1',
      'value',
      '42'
    );

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => adapter.evalScript({ script: 'return 1', keys: [key], args: [value] })).toThrow(
        'script arguments must be strings or finite numbers'
      );
    }
  });
});
