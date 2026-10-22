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
import { RedisCacheAdapter, asRedisLogicalKey } from '@fastgpt/dal/redis/adapter';
import { TeamVectorCountCache } from '@fastgpt/dal/redis/caches/teamVectorCount';

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeWithRedis = redisUrl ? describe : describe.skip;

describeWithRedis('vector rows fixed windows and global concurrency on Redis', () => {
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
          started();
          await blocked;
          throw new Error('transient count failure');
        }
      })
    );
    const [first] = await services[0].pushJobs({ teamId: 't' });
    try {
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
    } finally {
      release();
    }
  });

  it('allows at most one active statistics task across two independent workers', async () => {
    let active = 0;
    let maximum = 0;
    let finished = 0;
    const processor = async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active--;
      finished++;
    };
    workers.push(await services[0].getWorker(processor), await services[1].getWorker(processor));
    const jobs = await services[0].pushJobs({ teamId: 't', datasetIds: ['a', 'b', 'c', 'd'] });
    await Promise.all(jobs.map((job) => job.promote()));
    await vi.waitFor(() => expect(finished).toBe(5), { timeout: 10_000 });
    expect(maximum).toBe(1);
  });

  it('does not let an older team count refill a cache invalidated during counting', async () => {
    const adapter = new RedisCacheAdapter({
      getCommandClient: () => redis[0].getCommandConnection()
    });
    const teamId = `test-${randomUUID()}`;
    const cache = new TeamVectorCountCache({ redis: adapter, logger: { warn: vi.fn() } });
    try {
      const old = await cache.getRevision(teamId);
      await cache.set({ teamId, count: 10, revision: old! });
      expect(await cache.get(teamId)).toBe(10);
      await cache.invalidate(teamId);
      await cache.set({ teamId, count: 1, revision: old! });
      expect(await cache.get(teamId)).toBeUndefined();
      const current = await cache.getRevision(teamId);
      expect(current).not.toBe(old);
      await cache.set({ teamId, count: 20, revision: current! });
      expect(await cache.get(teamId)).toBe(20);
    } finally {
      await adapter.deleteMany([
        asRedisLogicalKey(`cache:team_vector_count:${teamId}`),
        asRedisLogicalKey(`cache:team_vector_count_revision:${teamId}`)
      ]);
    }
  });
});
