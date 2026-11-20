import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RedisLeaseLostError,
  RedisLeaseUnavailableError,
  RedisLeaseWaitTimeoutError,
  type RedisLeaseContext
} from '@fastgpt/dal/redis/caches/lease';

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

import { withSandboxLease } from '@fastgpt/service/core/ai/sandbox/application/lease';

describe('sandbox unified reentrant lease', () => {
  beforeEach(() => {
    mocks.withLease.mockReset();
    mocks.withLease.mockImplementation(async ({ fn }) =>
      fn({ signal: new AbortController().signal, assertValid: vi.fn() })
    );
  });

  it('uses a single unified per-sandboxId Redis key and supports reentrancy on the same sandboxId', async () => {
    const events: string[] = [];

    await withSandboxLease({
      sandboxId: 'sandbox-a',
      label: 'outer-prepare',
      fn: async (outerLease) => {
        events.push('outer:enter');

        // 同一异步调用链内对同一 sandboxId 重入应直接复用外层租约，不重复访问 Redis。
        await withSandboxLease({
          sandboxId: 'sandbox-a',
          label: 'inner-lifecycle',
          fn: async (innerLease) => {
            events.push('inner:same-sandbox');
            expect(innerLease.signal).toBe(outerLease.signal);
          }
        });

        // 嵌套访问不同 sandboxId（如父 Agent 调用子应用沙盒）必须独立获取该沙盒的物理租约。
        await withSandboxLease({
          sandboxId: 'sandbox-b',
          label: 'child-sandbox',
          fn: async () => {
            events.push('inner:other-sandbox');
          }
        });

        events.push('outer:exit');
      }
    });

    expect(events).toEqual([
      'outer:enter',
      'inner:same-sandbox',
      'inner:other-sandbox',
      'outer:exit'
    ]);
    expect(mocks.withLease.mock.calls.map(([params]) => params.key)).toEqual([
      'agent-sandbox:lease:sandbox-a',
      'agent-sandbox:lease:sandbox-b'
    ]);
  });

  it('rejects reentrant entry when the outer lease has already been lost', async () => {
    mocks.withLease.mockImplementationOnce(async ({ key, label, fn }) => {
      let lost = false;
      const context: RedisLeaseContext = {
        signal: new AbortController().signal,
        assertValid: () => {
          if (lost) throw new RedisLeaseLostError({ key, label });
        }
      };
      return await fn({
        ...context,
        assertValid: () => {
          context.assertValid();
          lost = true;
        }
      });
    });

    await expect(
      withSandboxLease({
        sandboxId: 'sandbox-lost',
        label: 'outer',
        fn: async () =>
          await withSandboxLease({
            sandboxId: 'sandbox-lost',
            label: 'inner',
            fn: vi.fn()
          })
      })
    ).rejects.toBeInstanceOf(RedisLeaseLostError);
    expect(mocks.withLease).toHaveBeenCalledTimes(1);
  });

  it('wakes concurrent in-process non-reentrant waiters immediately on local release without polling storm', async () => {
    const heldKeys = new Set<string>();
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

    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstTask = withSandboxLease({
      sandboxId: 'shared-local',
      label: 'holder-1',
      fn: async () => {
        await firstGate;
        return 'first';
      }
    });

    await Promise.resolve();
    const secondTask = withSandboxLease({
      sandboxId: 'shared-local',
      label: 'holder-2',
      retryInitialMs: 500,
      retryMaxMs: 500,
      fn: async () => 'second'
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    // 第二请求首次抢锁撞上占用后挂在本地唤醒队列上，不会继续发起轮询。
    expect(mocks.withLease).toHaveBeenCalledTimes(2);

    releaseFirst();
    await expect(Promise.all([firstTask, secondTask])).resolves.toEqual(['first', 'second']);
    // 释放后直接唤醒并一次命中，总调用仅 3 次（holder-1 成功 + holder-2 首次碰撞 + holder-2 唤醒命中）。
    expect(mocks.withLease).toHaveBeenCalledTimes(3);
  });

  it('fails fast when waitTimeoutMs is 0, backs off exponentially across processes, and honors AbortSignal', async () => {
    mocks.withLease.mockRejectedValueOnce(
      new RedisLeaseUnavailableError({
        key: 'agent-sandbox:lease:stable-id',
        label: 'cron-stop'
      })
    );
    await expect(
      withSandboxLease({
        sandboxId: 'stable-id',
        label: 'cron-stop',
        waitTimeoutMs: 0,
        fn: vi.fn()
      })
    ).rejects.toBeInstanceOf(RedisLeaseUnavailableError);
    expect(mocks.withLease).toHaveBeenCalledTimes(1);

    mocks.withLease
      .mockRejectedValueOnce(
        new RedisLeaseUnavailableError({ key: 'agent-sandbox:lease:stable-id', label: 'busy' })
      )
      .mockImplementationOnce(async ({ fn }) =>
        fn({ signal: new AbortController().signal, assertValid: vi.fn() })
      );

    await expect(
      withSandboxLease({
        sandboxId: 'stable-id',
        label: 'foreground-wake',
        waitTimeoutMs: 200,
        retryInitialMs: 5,
        retryMaxMs: 20,
        fn: vi.fn().mockResolvedValue('ok')
      })
    ).resolves.toBe('ok');
    expect(mocks.withLease).toHaveBeenCalledTimes(3);

    mocks.withLease.mockImplementationOnce(async ({ fn }) => {
      await fn({ signal: new AbortController().signal, assertValid: vi.fn() });
    });
    await expect(
      withSandboxLease({
        sandboxId: 'stable-id',
        label: 'inner-error',
        waitTimeoutMs: 200,
        retryInitialMs: 5,
        fn: async () => {
          throw new RedisLeaseUnavailableError({ key: 'inner-key', label: 'inner-label' });
        }
      })
    ).rejects.toThrow('Redis lease is already held for inner-label: inner-key');
    expect(mocks.withLease).toHaveBeenCalledTimes(4);

    // 外部 AbortSignal 触发时立即中断排队等待，无需傻等满 waitTimeoutMs。
    mocks.withLease.mockRejectedValue(
      new RedisLeaseUnavailableError({ key: 'agent-sandbox:lease:stable-id', label: 'busy' })
    );
    const abortController = new AbortController();
    setTimeout(() => abortController.abort(new Error('client cancelled')), 10);
    await expect(
      withSandboxLease({
        sandboxId: 'stable-id',
        label: 'cancelled-wait',
        waitTimeoutMs: 5_000,
        retryInitialMs: 200,
        retryMaxMs: 400,
        signal: abortController.signal,
        fn: vi.fn()
      })
    ).rejects.toThrow('client cancelled');

    await expect(
      withSandboxLease({
        sandboxId: 'stable-id',
        label: 'timeout',
        waitTimeoutMs: 10,
        retryInitialMs: 20,
        fn: vi.fn()
      })
    ).rejects.toBeInstanceOf(RedisLeaseWaitTimeoutError);
  });

  it('keeps physical lease context unpolluted when caller request signal aborts after lease entry', async () => {
    const physicalController = new AbortController();
    mocks.withLease.mockImplementationOnce(async ({ fn }) =>
      fn({ signal: physicalController.signal, assertValid: vi.fn() })
    );

    const requestController = new AbortController();
    await withSandboxLease({
      sandboxId: 'sandbox-physical',
      label: 'export',
      signal: requestController.signal,
      fn: async (lease) => {
        requestController.abort(new Error('client disconnected'));
        expect(lease.signal.aborted).toBe(false);
        expect(() => lease.assertValid()).not.toThrow();
      }
    });
  });
});
