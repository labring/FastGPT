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

const { leaseLogger, concurrencyLogger } = vi.hoisted(() => ({
  leaseLogger: { warn: vi.fn(), info: vi.fn() },
  concurrencyLogger: { warn: vi.fn(), info: vi.fn() }
}));
vi.mock('@fastgpt-sdk/otel/logger', () => ({
  getLogger: (categories: string[]) => {
    const category = categories.join('.');
    if (category === 'redis.lease') return leaseLogger;
    if (category === 'redis.lease.concurrency') return concurrencyLogger;
    throw new Error(`Unexpected logger category: ${category}`);
  }
}));

const key = asRedisLogicalKey('lock:agent-sandbox:init:sandbox-1');

describe('LeaseCache', () => {
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
    const cache = new LeaseCache({ redis });

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
    const cache = new LeaseCache({ redis });

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
    const cache = new LeaseCache({ redis });
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
    expect(leaseLogger.warn).toHaveBeenCalledWith(
      'Redis lease renew failed because token no longer matches',
      expect.objectContaining({ key, label: 'agent-sandbox-init' })
    );
    expect(concurrencyLogger.warn).not.toHaveBeenCalled();
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
      const cache = new LeaseCache({ redis });
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
      expect(leaseLogger.warn).toHaveBeenCalledWith(
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
      const cache = new LeaseCache({ redis });
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
      const cache = new LeaseCache({ redis });
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
      const cache = new LeaseCache({ redis });
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
      const cache = new LeaseCache({ redis });
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
      const cache = new LeaseCache({ redis });
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
      const cache = new LeaseCache({ redis });
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
      expect(leaseLogger.warn).toHaveBeenCalledWith(
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
    const cache = new LeaseCache({ redis });

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
    expect(leaseLogger.warn).toHaveBeenCalledWith(
      'Redis lease release failed',
      expect.objectContaining({ key, label: 'agent-sandbox-init' })
    );
  });

  it.each([
    [{ key: '', ttlMs: 60_000 }, 'key must be a non-empty string'],
    [{ key: 'lease', ttlMs: 0 }, 'ttlMs must be a positive safe integer'],
    [{ key: 'lease', ttlMs: 60, renewIntervalMs: 60 }, 'renewIntervalMs must be smaller than ttlMs']
  ])('rejects invalid lease options %#', async (input, message) => {
    const cache = new LeaseCache({ redis });

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
  const held = new Map<string, { key: string; expiresAt: number }>();
  const waiting = new Map<string, { key: string; expiresAt: number }>();
  const redis = {
    acquireLease: vi.fn(),
    releaseLease: vi.fn(),
    renewLease: vi.fn(),
    evalScript: vi.fn()
  } as any;
  const options = {
    key: 'vector:recall',
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
    waiting.clear();
    redis.acquireLease.mockImplementation(async ({ key, token, ttlMs, concurrency }: any) => {
      for (const [heldToken, lease] of held) {
        if (lease.expiresAt <= Date.now()) held.delete(heldToken);
      }
      if ([...held.values()].filter((lease) => lease.key === key).length >= concurrency) {
        return false;
      }
      held.set(token, { key, expiresAt: Date.now() + ttlMs });
      return true;
    });
    redis.renewLease.mockImplementation(async ({ key, token, ttlMs }: any) => {
      const lease = held.get(token);
      if (!lease || lease.key !== key || lease.expiresAt <= Date.now()) return false;
      lease.expiresAt = Date.now() + ttlMs;
      return true;
    });
    redis.releaseLease.mockImplementation(async ({ key, token }: any) => {
      if (held.get(token)?.key !== key) return false;
      held.delete(token);
      return true;
    });
    redis.evalScript.mockImplementation(async ({ script, keys: [key], args }: any) => {
      const [token, ttlMs, concurrency] = args;
      if (key.includes('concurrency-waiters:')) {
        for (const [waiter, item] of waiting) {
          if (item.expiresAt <= Date.now()) waiting.delete(waiter);
        }
        if (script.includes('ZADD')) {
          waiting.set(token, { key, expiresAt: Date.now() + ttlMs });
          return [...waiting.values()].filter((item) => item.key === key).length;
        }
        return Number(waiting.delete(token));
      }
      if (script.includes('ZCARD')) {
        return Number(await redis.acquireLease({ key, token, ttlMs, concurrency }));
      }
      if (script.includes('ZSCORE')) {
        return Number(await redis.renewLease({ key, token, ttlMs }));
      }
      return Number(await redis.releaseLease({ key, token }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shares slots across instances, waits for release and renews running tasks', async () => {
    const caches = [new LeaseCache({ redis }), new LeaseCache({ redis })];
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
    expect(concurrencyLogger.info.mock.calls.map(([, metadata]) => metadata.queuedCount)).toEqual([
      1, 2, 3, 4
    ]);
    expect(waiting.size).toBe(0);
  });

  it('keeps different resource keys independent and provides default wait settings', async () => {
    const cache = new LeaseCache({ redis });
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
    const cache = new LeaseCache({ redis });
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
    expect(redis.acquireLease).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    expect(isRedisLeaseError(new RedisLeaseWaitTimeoutError(options))).toBe(true);
    expect(concurrencyLogger.info).toHaveBeenCalledOnce();
    expect(concurrencyLogger.info).toHaveBeenCalledWith('Redis concurrency lease queued', {
      key: options.key,
      label: options.label,
      queuedCount: 1
    });
    expect(leaseLogger.info).not.toHaveBeenCalled();
    expect(waiting.size).toBe(0);
  });

  it('releases a slot acquired after the wait deadline without starting work', async () => {
    let resolveAcquire!: (value: boolean) => void;
    redis.acquireLease.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveAcquire = resolve;
      })
    );
    const fn = vi.fn();
    const cache = new LeaseCache({ redis });
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
    const cache = new LeaseCache({ redis });

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
    const cache = new LeaseCache({ redis });

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
    const cache = new LeaseCache({ redis });
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
    expect(waiting.size).toBe(0);
  });

  it('does not acquire for an already aborted caller', async () => {
    const controller = new AbortController();
    const error = new Error('already cancelled');
    controller.abort(error);
    const cache = new LeaseCache({ redis });

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
    const cache = new LeaseCache({ redis });

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
    const cache = new LeaseCache({ redis });
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

  it('counts all old tokens after lowering the limit and refreshes queued callers', async () => {
    let concurrency = 2;
    const cache = new LeaseCache({ redis });
    const finish: (() => void)[] = [];
    const work = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
    const running = [0, 1].map(() => cache.withConcurrency({ ...options, fn: work }));
    await vi.advanceTimersByTimeAsync(0);
    const queued = cache.withConcurrency({ ...options, concurrency: () => concurrency, fn: work });
    await vi.advanceTimersByTimeAsync(0);
    expect(work).toHaveBeenCalledTimes(2);

    concurrency = 1;
    finish[0]();
    await running[0];
    await vi.advanceTimersByTimeAsync(10);
    expect(work).toHaveBeenCalledTimes(2);
    expect(held.size).toBe(1);

    finish[1]();
    await running[1];
    await vi.advanceTimersByTimeAsync(10);
    expect(work).toHaveBeenCalledTimes(3);
    finish[2]();
    await queued;
    expect(held.size).toBe(0);
  });

  it('lets queued callers observe an increased limit', async () => {
    let concurrency = 1;
    const cache = new LeaseCache({ redis });
    let finish!: () => void;
    const running = cache.withConcurrency({
      ...options,
      concurrency: 1,
      fn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    });
    await vi.advanceTimersByTimeAsync(0);
    const work = vi.fn(async () => 'next');
    const queued = cache.withConcurrency({ ...options, concurrency: () => concurrency, fn: work });
    await vi.advanceTimersByTimeAsync(0);
    expect(work).not.toHaveBeenCalled();
    concurrency = 2;
    await vi.advanceTimersByTimeAsync(5);
    await expect(queued).resolves.toBe('next');
    finish();
    await running;
  });

  it('releases an acquisition made with a stale limit before entering the callback', async () => {
    let concurrency = 2;
    const acquire = redis.acquireLease.getMockImplementation()!;
    redis.acquireLease.mockImplementationOnce(async (props: any) => {
      const result = await acquire(props);
      concurrency = 1;
      return result;
    });
    const cache = new LeaseCache({ redis });
    const fn = vi.fn(async () => 'current-limit');
    const result = cache.withConcurrency({ ...options, concurrency: () => concurrency, fn });
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).not.toHaveBeenCalled();
    expect(held.size).toBe(0);

    await vi.advanceTimersByTimeAsync(5);
    await expect(result).resolves.toBe('current-limit');
    expect(redis.acquireLease).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('bypasses Redis for zero and lets queued callers observe a disabled limit', async () => {
    const cache = new LeaseCache({ redis });
    await expect(
      cache.withConcurrency({
        ...options,
        concurrency: 0,
        fn: async ({ assertValid }) => {
          assertValid();
          return 'unlimited';
        }
      })
    ).resolves.toBe('unlimited');
    expect(redis.evalScript).not.toHaveBeenCalled();
    expect(concurrencyLogger.info).not.toHaveBeenCalled();

    redis.acquireLease.mockResolvedValue(false);
    let concurrency = 1;
    const work = vi.fn(async () => 'disabled');
    const queued = cache.withConcurrency({ ...options, concurrency: () => concurrency, fn: work });
    await vi.advanceTimersByTimeAsync(0);
    concurrency = 0;
    await vi.advanceTimersByTimeAsync(5);
    await expect(queued).resolves.toBe('disabled');
    expect(work).toHaveBeenCalledOnce();
    expect(waiting.size).toBe(0);
  });

  it('rechecks a re-enabled limit after removing a queued waiter', async () => {
    let concurrency = 1;
    const cache = new LeaseCache({ redis });
    let finish!: () => void;
    const running = cache.withConcurrency({
      ...options,
      concurrency: 1,
      fn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    });
    await vi.advanceTimersByTimeAsync(0);
    const work = vi.fn(async () => 'done');
    const queued = cache.withConcurrency({ ...options, concurrency: () => concurrency, fn: work });
    await vi.advanceTimersByTimeAsync(0);
    const evaluate = redis.evalScript.getMockImplementation()!;
    redis.evalScript.mockImplementation((input: any) => {
      if (input.keys[0].includes('concurrency-waiters:') && !input.script.includes('ZADD')) {
        concurrency = 1;
      }
      return evaluate(input);
    });
    concurrency = 0;
    await vi.advanceTimersByTimeAsync(5);
    expect(work).not.toHaveBeenCalled();
    expect(held.size).toBe(1);

    finish();
    await running;
    await vi.advanceTimersByTimeAsync(5);
    await expect(queued).resolves.toBe('done');
    expect(waiting.size).toBe(0);
  });

  it('keeps enforcing capacity when queue statistics fail', async () => {
    const evaluate = redis.evalScript.getMockImplementation()!;
    redis.evalScript.mockImplementation((input: any) => {
      if (input.keys[0].includes('concurrency-waiters:') && input.script.includes('ZADD')) {
        return Promise.reject(new Error('queue statistics unavailable'));
      }
      return evaluate(input);
    });
    redis.acquireLease.mockResolvedValueOnce(false);
    const cache = new LeaseCache({ redis });
    const fn = vi.fn(async () => 'done');
    const result = cache.withConcurrency({ ...options, fn });

    await vi.advanceTimersByTimeAsync(5);

    await expect(result).resolves.toBe('done');
    expect(redis.acquireLease).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledOnce();
    expect(concurrencyLogger.info).not.toHaveBeenCalled();
    expect(held.size).toBe(0);
    expect(waiting.size).toBe(0);
  });

  it('rejects malformed Lua results without entering the callback', async () => {
    redis.evalScript.mockResolvedValue('unexpected');
    const cache = new LeaseCache({ redis });
    const fn = vi.fn();
    await expect(cache.withConcurrency({ ...options, fn })).rejects.toMatchObject({
      name: 'RedisLeaseAcquireError',
      cause: { code: 'REDIS_INVALID_RESPONSE' }
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    [{ concurrency: -1 }, 'concurrency'],
    [{ concurrency: 1.5 }, 'concurrency'],
    [{ waitTimeoutMs: 0 }, 'waitTimeoutMs'],
    [{ retryIntervalMs: 0 }, 'retryIntervalMs'],
    [{ key: '' }, 'key'],
    [{ ttlMs: 0 }, 'ttlMs'],
    [{ renewIntervalMs: 100 }, 'renewIntervalMs']
  ])('validates concurrency options before touching Redis %#', async (invalid, field) => {
    const cache = new LeaseCache({ redis });

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
