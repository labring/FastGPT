import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('@fastgpt/dal/redis/bullmq');

const bullMQMocks = vi.hoisted(() => {
  const queue = { id: 'queue' };
  const flowProducer = { id: 'flow-producer' };
  const worker = { id: 'worker' };
  const redisRuntime = {
    id: 'redis-runtime',
    getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
  };
  const runtime = {
    getQueue: vi.fn(() => queue),
    getFlowProducer: vi.fn(() => flowProducer),
    getWorker: vi.fn(() => worker),
    getLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))
  };

  return {
    queue,
    flowProducer,
    worker,
    redisRuntime,
    runtime,
    getRedisBullMQRuntime: vi.fn(() => runtime)
  };
});

vi.mock('@fastgpt/dal/redis/bullmq/context', () => ({
  getRedisBullMQRuntime: bullMQMocks.getRedisBullMQRuntime
}));

vi.mock('@fastgpt/dal/redis/runtime', () => ({
  getRedisRuntime: () => bullMQMocks.redisRuntime
}));

describe('DAL BullMQ binding', () => {
  let bullMQ: typeof import('@fastgpt/dal/redis/bullmq');

  beforeEach(async () => {
    vi.resetModules();
    bullMQMocks.runtime.getQueue.mockClear();
    bullMQMocks.runtime.getFlowProducer.mockClear();
    bullMQMocks.runtime.getWorker.mockClear();
    bullMQMocks.getRedisBullMQRuntime.mockClear();
    bullMQ = await import('@fastgpt/dal/redis/bullmq');
  });

  it('delegates queue creation to the DAL BullMQ Runtime', () => {
    const queue = bullMQ.bullMQ.getQueue(bullMQ.QueueNames.datasetDelete, { prefix: 'test' });

    expect(queue).toBe(bullMQMocks.queue);
    expect(bullMQMocks.getRedisBullMQRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        redisRuntime: bullMQMocks.redisRuntime,
        workerLifecycle: {
          restartOnClose: true,
          resumeOnPause: true
        }
      })
    );
    expect(bullMQMocks.runtime.getQueue).toHaveBeenCalledWith('datasetDelete', {
      prefix: 'test'
    });
  });

  it('keeps service worker defaults while delegating worker lifecycle to DAL', () => {
    const processor = vi.fn();
    bullMQ.bullMQ.getWorker(bullMQ.QueueNames.datasetSync, processor, { concurrency: 2 });

    expect(bullMQMocks.runtime.getWorker).toHaveBeenCalledWith(
      'datasetSync',
      processor,
      expect.objectContaining({
        concurrency: 2,
        lockDuration: 600000,
        stalledInterval: 30000,
        maxStalledCount: 3,
        removeOnComplete: { count: 0 },
        removeOnFail: { count: 0 }
      })
    );
  });

  it('delegates FlowProducer access to the DAL BullMQ Runtime', () => {
    expect(bullMQ.bullMQ.getFlowProducer()).toBe(bullMQMocks.flowProducer);
    expect(bullMQMocks.runtime.getFlowProducer).toHaveBeenCalledTimes(1);
  });
});
