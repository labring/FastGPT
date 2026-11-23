import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetPerfVectorCountSchedulerForTest,
  scheduleVectorCountsForPerf
} from '@fastgpt/service/common/opsPerf/vectorCountScheduler';

describe('opsPerf process-wide vectorCountScheduler', () => {
  beforeEach(() => {
    resetPerfVectorCountSchedulerForTest({ maxConcurrency: 4, maxQueueSize: 64 });
  });

  afterEach(() => {
    resetPerfVectorCountSchedulerForTest();
  });

  it('enforces process-wide concurrency cap across concurrent searches and stops dispatching queued work after timeout', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<() => void> = [];
    const fetchCount = vi.fn(
      ({ datasetId }: { teamId: string; datasetId: string }) =>
        new Promise<number>((resolve) => {
          active += 1;
          if (active > maxActive) maxActive = active;
          resolvers.push(() => {
            active -= 1;
            resolve(Number(datasetId.replace('ds-', '')) * 1000);
          });
        })
    );

    const p1 = scheduleVectorCountsForPerf({
      teamId: 'team-1',
      datasetIds: ['ds-1', 'ds-2', 'ds-3', 'ds-4'],
      timeoutMs: 40,
      fetchCount
    });
    const p2 = scheduleVectorCountsForPerf({
      teamId: 'team-1',
      datasetIds: ['ds-5', 'ds-6', 'ds-7', 'ds-8'],
      timeoutMs: 40,
      fetchCount
    });

    await Promise.resolve();
    // Across BOTH concurrent requests (8 datasets), at most 4 counts run simultaneously
    expect(maxActive).toBe(4);
    expect(fetchCount).toHaveBeenCalledTimes(4);

    // Wait for both batches to time out while ds-5..ds-8 are still queued
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBeUndefined();
    expect(r2).toBeUndefined();

    // Completing the 4 in-flight counts must NOT dispatch ds-5..ds-8 because all waiters timed out
    while (resolvers.length > 0) {
      resolvers.shift()!();
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchCount).toHaveBeenCalledTimes(4);
  });

  it('deduplicates concurrent requests for the same dataset and respects backlog queue cap', async () => {
    const fetchCount = vi.fn(async () => 25_000);
    const [r1, r2] = await Promise.all([
      scheduleVectorCountsForPerf({
        teamId: 'team-1',
        datasetIds: ['ds-shared'],
        fetchCount
      }),
      scheduleVectorCountsForPerf({
        teamId: 'team-1',
        datasetIds: ['ds-shared'],
        fetchCount
      })
    ]);

    expect(r1).toEqual({ totalIndexCount: 25_000, maxDatasetIndexCount: 25_000 });
    expect(r2).toEqual({ totalIndexCount: 25_000, maxDatasetIndexCount: 25_000 });
    expect(fetchCount).toHaveBeenCalledTimes(1);

    // Backlog queue cap drops overflow cleanly without dispatching
    resetPerfVectorCountSchedulerForTest({ maxConcurrency: 1, maxQueueSize: 2 });
    const slowFetch = vi.fn(() => new Promise<number>(() => {}));
    const overflowPromise = scheduleVectorCountsForPerf({
      teamId: 'team-1',
      datasetIds: ['q-1', 'q-2', 'q-3'],
      timeoutMs: 50,
      fetchCount: slowFetch
    });
    expect(await overflowPromise).toBeUndefined();
    expect(slowFetch).toHaveBeenCalledTimes(0);
  });
});
