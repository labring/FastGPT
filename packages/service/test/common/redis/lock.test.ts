import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlobalRedisConnection } from '@fastgpt/service/common/redis';
import {
  RedisLeaseLostError,
  RedisLeaseUnavailableError,
  withRedisLease
} from '@fastgpt/service/common/redis/lock';

const getRedis = () => getGlobalRedisConnection() as any;

describe('withRedisLease', () => {
  beforeEach(() => {
    vi.useRealTimers();
    const redis = getRedis();
    redis._storage.clear();
    redis.set.mockClear();
    redis.eval.mockClear();
  });

  it('acquires the lease, renews it and releases it with token check', async () => {
    vi.useFakeTimers();
    const redis = getRedis();
    const work = vi.fn(() => new Promise<string>((resolve) => setTimeout(() => resolve('ok'), 40)));

    const resultPromise = withRedisLease({
      key: 'lease-test',
      label: 'lease-test',
      ttlMs: 60,
      renewIntervalMs: 10,
      fn: work
    });

    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(30);

    await expect(resultPromise).resolves.toBe('ok');
    expect(work).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('lock:lease-test', expect.any(String), 'PX', 60, 'NX');
    expect(await redis.get('lock:lease-test')).toBeNull();
  });

  it('does not run without lease when another holder exists', async () => {
    const redis = getRedis();
    await redis.set('lock:lease-test', 'other-token', 'PX', 60_000);
    const work = vi.fn();

    await expect(
      withRedisLease({
        key: 'lease-test',
        label: 'lease-test',
        ttlMs: 60_000,
        fn: work
      })
    ).rejects.toBeInstanceOf(RedisLeaseUnavailableError);
    expect(work).not.toHaveBeenCalled();
  });

  it('invalidates the task context when renewal detects the lease was replaced', async () => {
    vi.useFakeTimers();
    const redis = getRedis();
    let context:
      | {
          signal: AbortSignal;
          assertValid: () => void;
        }
      | undefined;
    let resolveWork!: () => void;
    const workPromise = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const resultPromise = withRedisLease({
      key: 'lease-test',
      label: 'lease-test',
      ttlMs: 60,
      renewIntervalMs: 10,
      fn: async (leaseContext) => {
        context = leaseContext;
        await workPromise;
      }
    });

    await Promise.resolve();
    await redis.set('lock:lease-test', 'other-token', 'PX', 60_000);
    await vi.advanceTimersByTimeAsync(15);

    expect(context?.signal.aborted).toBe(true);
    expect(() => context?.assertValid()).toThrow(RedisLeaseLostError);

    resolveWork();
    await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
    expect(await redis.get('lock:lease-test')).toBe('other-token');
  });

  it('invalidates a context when its confirmed expiry is reached', async () => {
    vi.useFakeTimers();
    const redis = getRedis();
    redis.eval.mockRejectedValueOnce(new Error('redis unavailable'));
    let assertLeaseValid!: () => void;
    let resolveWork!: () => void;
    const workPromise = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const resultPromise = withRedisLease({
      key: 'lease-expiry-test',
      label: 'lease-expiry-test',
      ttlMs: 60,
      renewIntervalMs: 50,
      fn: async ({ assertValid }) => {
        assertLeaseValid = assertValid;
        await workPromise;
      }
    });

    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60);
    expect(assertLeaseValid).toThrow(RedisLeaseLostError);

    resolveWork();
    await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
  });
});
