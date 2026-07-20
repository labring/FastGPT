import type { DurableSagaEngine } from '@fastgpt-sdk/durable-saga';
import {
  createBullMQSagaWakeupScheduler,
  createDurableSagaRecoveryPoller,
  createDurableSagaWakeupProcessor,
  createRedisSagaLeaseProvider
} from '@fastgpt/service/common/durableSaga';
import type { ClientSession } from '@fastgpt/service/common/mongo';
import type { RedisLeaseContext } from '@fastgpt/service/common/redis/lock';
import { describe, expect, it, vi } from 'vitest';

describe('createRedisSagaLeaseProvider', () => {
  it('deduplicates and acquires keys in stable order before releasing in reverse order', async () => {
    const calls: string[] = [];
    const provider = createRedisSagaLeaseProvider({
      ttlMs: 1_000,
      mapKey: (key) => `mapped:${key}`,
      runWithLease: async ({ key, fn }) => {
        calls.push(`acquire:${key}`);
        const context: RedisLeaseContext = {
          signal: new AbortController().signal,
          assertValid: () => calls.push(`assert:${key}`)
        };
        try {
          return await fn(context);
        } finally {
          calls.push(`release:${key}`);
        }
      }
    });

    const result = await provider.withLeases(['b', 'a', 'b'], async (lease) => {
      await lease.assertValid();
      return 'done';
    });

    expect(result).toBe('done');
    expect(calls).toEqual([
      'acquire:mapped:a',
      'acquire:mapped:b',
      'assert:mapped:a',
      'assert:mapped:b',
      'release:mapped:b',
      'release:mapped:a'
    ]);
  });
});

describe('createBullMQSagaWakeupScheduler', () => {
  it('creates a deterministic revision-gated delayed job', async () => {
    const add = vi.fn(async () => undefined);
    const now = new Date('2026-01-01T00:00:00.000Z');
    const scheduler = createBullMQSagaWakeupScheduler({
      queue: { add },
      now: () => now
    });
    const runAt = new Date(now.getTime() + 5_000);

    await scheduler.schedule({ sagaId: 'saga', expectedRevision: 4, runAt });
    await scheduler.schedule({ sagaId: 'saga', expectedRevision: 4, runAt });

    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[0]?.[1]).toEqual({ sagaId: 'saga', expectedRevision: 4 });
    expect(add.mock.calls[0]?.[2]).toMatchObject({
      delay: 5_000,
      attempts: 3,
      jobId: expect.stringMatching(/^[a-f0-9]{64}$/),
      removeOnComplete: true,
      removeOnFail: true
    });
    expect(add.mock.calls[1]?.[2]?.jobId).toBe(add.mock.calls[0]?.[2]?.jobId);
  });
});

describe('createDurableSagaWakeupProcessor', () => {
  it('passes expectedRevision to the Engine so stale BullMQ jobs are no-ops', async () => {
    const run = vi.fn(async () => ({ type: 'notFound' as const }));
    const engine = { run } as unknown as DurableSagaEngine<ClientSession>;
    const processor = createDurableSagaWakeupProcessor(engine);

    await processor({ data: { sagaId: 'saga', expectedRevision: 8 } });

    expect(run).toHaveBeenCalledWith('saga', { expectedRevision: 8 });
    await expect(processor({ data: { sagaId: 'saga', expectedRevision: 1.5 } })).rejects.toThrow(
      'Invalid durable Saga wake-up job'
    );
  });
});

describe('createDurableSagaRecoveryPoller', () => {
  it('coalesces overlapping process-local scans', async () => {
    let resolveScan = (_value: number) => {};
    const scan = new Promise<number>((resolve) => {
      resolveScan = resolve;
    });
    const recoverDue = vi.fn(() => scan);
    const engine = { recoverDue } as unknown as DurableSagaEngine<ClientSession>;
    const poller = createDurableSagaRecoveryPoller({ engine });

    const first = poller.runOnce();
    const second = poller.runOnce();
    resolveScan(3);

    await expect(first).resolves.toBe(3);
    await expect(second).resolves.toBe(3);
    expect(recoverDue).toHaveBeenCalledTimes(1);
  });
});
