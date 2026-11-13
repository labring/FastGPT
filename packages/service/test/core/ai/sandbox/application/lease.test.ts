import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';
import { RedisLeaseWaitTimeoutError } from '@fastgpt/dal/redis/caches/lease';

const mocks = vi.hoisted(() => ({ withLease: vi.fn() }));

vi.mock('@fastgpt/dal/redis/caches', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/dal/redis/caches')>();
  return {
    ...actual,
    LeaseCache: class MockLeaseCache {
      withLease = mocks.withLease;
    }
  };
});

import { withSandboxLifecycleLease } from '@fastgpt/service/core/ai/sandbox/application/lease';

describe('sandbox lifecycle leases', () => {
  const heldKeys = new Set<string>();

  beforeEach(() => {
    heldKeys.clear();
    mocks.withLease.mockReset();
    mocks.withLease.mockImplementation(async ({ key, label, fn }) => {
      if (heldKeys.has(key)) {
        throw new RedisLeaseUnavailableError({ key, label });
      }
      heldKeys.add(key);
      try {
        return await fn({ signal: new AbortController().signal, assertValid: vi.fn() });
      } finally {
        heldKeys.delete(key);
      }
    });
  });

  it('queues concurrent foreground callers and fails non-blocking try-lock callers on the same key', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withSandboxLifecycleLease({
      sandboxId: 'shared-sandbox',
      label: 'foreground-1',
      retryIntervalMs: 10,
      fn: async () => {
        order.push('first:start');
        await firstGate;
        order.push('first:end');
        return 'first';
      }
    });

    const second = withSandboxLifecycleLease({
      sandboxId: 'shared-sandbox',
      label: 'foreground-2',
      retryIntervalMs: 10,
      fn: async () => {
        order.push('second:start');
        order.push('second:end');
        return 'second';
      }
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 15));
    expect(order).toEqual(['first:start']);

    // Background cron caller with waitTimeoutMs: 0 skips immediately on the exact same Redis key
    await expect(
      withSandboxLifecycleLease({
        sandboxId: 'shared-sandbox',
        label: 'cron-try',
        waitTimeoutMs: 0,
        fn: async () => 'unreachable'
      })
    ).rejects.toBeInstanceOf(RedisLeaseUnavailableError);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(order).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('throws RedisLeaseWaitTimeoutError when bounded wait expires', async () => {
    heldKeys.add('agent-sandbox:lifecycle:stuck');

    await expect(
      withSandboxLifecycleLease({
        sandboxId: 'stuck',
        label: 'foreground-timeout',
        waitTimeoutMs: 25,
        retryIntervalMs: 8,
        fn: async () => 'unreachable'
      })
    ).rejects.toBeInstanceOf(RedisLeaseWaitTimeoutError);
  });
});
