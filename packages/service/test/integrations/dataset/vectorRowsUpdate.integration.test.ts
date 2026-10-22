import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisRuntime } from '@fastgpt/dal/redis/runtime/connection';
import { RedisBullMQRuntime } from '@fastgpt/dal/redis/bullmq/runtime';
import type { BullMQBinding } from '@fastgpt/dal/redis/bullmq/binding';
import type { Queue, Worker } from '@fastgpt/dal/redis/bullmq/types';
import {
  VectorRowsUpdateMQService,
  type VectorRowsUpdateJobData
} from '@fastgpt/service/core/dataset/vectorData/mq';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('vector rows fixed windows, retries and node concurrency on Redis', () => {
  let redis: RedisRuntime[];
  let services: VectorRowsUpdateMQService[];
  let queue: Queue<VectorRowsUpdateJobData>;
  let workers: Worker<VectorRowsUpdateJobData>[];

  beforeEach(() => {
    const name = `vector-rows-test-${randomUUID()}`;
    redis = [new RedisRuntime({ redisUrl: redisUrl! }), new RedisRuntime({ redisUrl: redisUrl! })];
    services = redis.map((connection) => {
      const runtime = new RedisBullMQRuntime({ redisRuntime: connection });
      const binding = {
        getQueue: (_name: string, opts: any) => runtime.getQueue(name, opts),
        getWorker: (_name: string, processor: any, opts: any) =>
          runtime.getWorker(name, processor, opts)
      } as unknown as BullMQBinding;
      return new VectorRowsUpdateMQService(binding);
    });
    queue = services[0].getQueue();
    workers = [];
  });

  afterEach(async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    await queue.obliterate({ force: true });
    await Promise.all(redis.map((connection) => connection.close()));
  });

  it('coalesces each target without moving its original one-minute deadline', async () => {
    const first = await services[0].pushJobs({ teamId: 't', datasetIds: ['a', 'b'] });
    const deadlines = new Map(first.map((job) => [job.id, job.timestamp + job.delay]));
    await services[1].pushJobs({ teamId: 't', datasetIds: ['a'] });
    const pending = await queue.getJobs(['delayed']);
    expect(pending).toHaveLength(3);
    for (const job of pending) {
      expect(job.delay).toBe(60_000);
      expect(job.timestamp + job.delay).toBe(deadlines.get(job.id));
    }
  });

  it('schedules active updates in the next window and keeps that window through an older retry', async () => {
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let attempts = 0;
    workers.push(
      await services[0].getWorker(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('transient count failure');
        }
        if (attempts === 2) {
          started();
          await blocked;
          throw new Error('the next window will retry the failed count');
        }
      })
    );
    const [first] = await services[0].pushJobs({ teamId: 't' });
    try {
      await first.promote();
      await vi.waitFor(
        async () => {
          expect((await queue.getJob(first.id!))?.attemptsStarted).toBe(1);
          expect(await first.getState()).toBe('delayed');
        },
        { timeout: 10_000 }
      );
      await first.promote();
      await entered;
      const [next] = await services[1].pushJobs({ teamId: 't' });
      expect(next.id).not.toBe(first.id);
      expect(await next.getState()).toBe('delayed');
      expect(await queue.getDeduplicationJobId('team/t')).toBe(next.id);
      release();
      await vi.waitFor(
        async () => {
          expect(attempts).toBe(2);
          expect(await queue.getJob(first.id!)).toBeUndefined();
        },
        { timeout: 10_000 }
      );
      expect(await queue.getDeduplicationJobId('team/t')).toBe(next.id);
      const [merged] = await services[0].pushJobs({ teamId: 't' });
      expect(merged.id).toBe(next.id);
      await next.promote();
      await vi.waitFor(
        async () => {
          expect(attempts).toBe(3);
          expect(await queue.getJob(next.id!)).toBeUndefined();
        },
        { timeout: 10_000 }
      );
    } finally {
      release();
    }
  });

  it('delays failed work so ready jobs run first, then retries indefinitely with a one-hour cap', async () => {
    const order: string[] = [];
    let attempts = 0;
    workers.push(
      await services[0].getWorker(async ({ teamId }) => {
        order.push(teamId);
        if (teamId === 'retry' && ++attempts <= 9) throw new Error('database offline');
      })
    );
    const [retry] = await services[0].pushJobs({ teamId: 'retry' });
    await retry.promote();

    for (let attempt = 1; attempt <= 9; attempt++) {
      await vi.waitFor(
        async () => {
          const current = await queue.getJob(retry.id!);
          expect(current?.attemptsStarted).toBe(attempt);
          expect(await current?.getState()).toBe('delayed');
          expect(current?.delay).toBe(Math.min(60_000 * 2 ** (attempt - 1), 3_600_000));
        },
        { timeout: 10_000 }
      );
      const [merged] = await services[1].pushJobs({ teamId: 'retry' });
      expect(merged.id).toBe(retry.id);

      if (attempt === 1) {
        const [other] = await services[0].pushJobs({ teamId: 'other' });
        // 两个任务都进入 waiting 时，失败任务也应排在已经就绪的其他任务后面。
        await queue.pause();
        await other.promote();
        await retry.promote();
        await queue.resume();
      } else {
        await retry.promote();
      }
    }

    await vi.waitFor(() => expect(attempts).toBe(10), { timeout: 10_000 });
    await vi.waitFor(async () => expect(await queue.getJob(retry.id!)).toBeUndefined());
    expect(order.slice(0, 3)).toEqual(['retry', 'other', 'retry']);
    expect(await queue.getFailedCount()).toBe(0);
  });

  it('runs one task per node while allowing two independent nodes to work concurrently', async () => {
    let active = 0;
    let maximum = 0;
    let finished = 0;
    const activeByNode = [0, 0];
    const maximumByNode = [0, 0];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await queue.setGlobalConcurrency(1);
    for (let node = 0; node < 2; node++) {
      workers.push(
        await services[node].getWorker(async () => {
          activeByNode[node]++;
          maximumByNode[node] = Math.max(maximumByNode[node], activeByNode[node]);
          active++;
          maximum = Math.max(maximum, active);
          await gate;
          active--;
          activeByNode[node]--;
          finished++;
        })
      );
    }
    try {
      expect(await queue.getGlobalConcurrency()).toBeNull();
      const jobs = await services[0].pushJobs({ teamId: 't', datasetIds: ['a', 'b', 'c', 'd'] });
      await Promise.all(jobs.map((job) => job.promote()));
      await vi.waitFor(() => expect(active).toBe(2), { timeout: 10_000 });
      release();
      await vi.waitFor(() => expect(finished).toBe(5), { timeout: 10_000 });
      expect(maximum).toBe(2);
      expect(maximumByNode).toEqual([1, 1]);
    } finally {
      release();
    }
  });
});
