import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asRedisLogicalKey, createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import {
  createLeaseRepository,
  isRedisLeaseError,
  RedisLeaseAcquireError,
  RedisLeaseLostError,
  RedisLeaseUnavailableError
} from '@fastgpt/dal/redis/repositories';

const key = asRedisLogicalKey('lock:agent-sandbox:init:sandbox-1');

describe('LeaseRepository', () => {
  const logger = { warn: vi.fn() };
  const redis = {
    acquireLease: vi.fn(),
    releaseLease: vi.fn(),
    renewLease: vi.fn()
  };

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
    const repository = createLeaseRepository({ redis, logger });

    const resultPromise = repository.withLease({
      key: 'agent-sandbox:init:sandbox-1',
      label: 'agent-sandbox-init',
      ttlMs: 60,
      renewIntervalMs: 10,
      fn: () => work
    });

    await vi.waitFor(() =>
      expect(redis.acquireLease).toHaveBeenCalledWith({
        key,
        token: expect.any(String),
        ttlMs: 60
      })
    );
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
    const repository = createLeaseRepository({ redis, logger });

    await expect(
      repository.withLease({
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
    const repository = createLeaseRepository({ redis, logger });
    const resultPromise = repository.withLease({
      key: 'agent-sandbox:init:sandbox-1',
      label: 'agent-sandbox-init',
      ttlMs: 60,
      renewIntervalMs: 10,
      fn: () => work
    });

    await vi.waitFor(() => expect(redis.acquireLease).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(15);
    resolveWork();

    await expect(resultPromise).rejects.toBeInstanceOf(RedisLeaseLostError);
    expect(logger.warn).toHaveBeenCalledWith(
      'Redis lease renew failed because token no longer matches',
      expect.objectContaining({ key, label: 'agent-sandbox-init' })
    );
  });

  it('wraps acquire errors and keeps release best-effort', async () => {
    const acquireError = new Error('redis unavailable');
    redis.acquireLease.mockRejectedValue(acquireError);
    const repository = createLeaseRepository({ redis, logger });

    await expect(
      repository.withLease({
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
      repository.withLease({
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
    const repository = createLeaseRepository({ redis, logger });

    await expect(
      repository.withLease({
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
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

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
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    await expect(adapter.acquireLease({ key, token: 'token-1', ttlMs: 60 })).resolves.toBe(false);
  });

  it.each(['invalid', 2])('rejects malformed lease command responses %#', async (result) => {
    client.set.mockResolvedValue(result);
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });
    await expect(adapter.acquireLease({ key, token: 'token-1', ttlMs: 60 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'lease.acquire'
    });

    client.eval.mockResolvedValue(result);
    await expect(adapter.renewLease({ key, token: 'token-1', ttlMs: 60 })).rejects.toMatchObject({
      code: 'REDIS_INVALID_RESPONSE',
      operation: 'lease.renew'
    });
  });

  it.each([
    [{ token: '', ttlMs: 60 }, 'token must be a non-empty string'],
    [{ token: 'token-1', ttlMs: 0 }, 'ttlMs must be a positive safe integer']
  ])('rejects invalid adapter arguments %#', (input, message) => {
    const adapter = createRedisStoreAdapter({ getCommandClient: () => client as any });

    expect(() => adapter.acquireLease({ key, ...input } as any)).toThrow(message);
    expect(client.set).not.toHaveBeenCalled();
  });
});
