import { randomUUID } from 'node:crypto';
import { bullMQ } from '@fastgpt/dal/redis/bullmq';
import { QueueNames } from '@fastgpt/dal/redis/bullmq/names';
import { RedisBullMQRuntime } from '@fastgpt/dal/redis/bullmq/runtime';
import { datasetTrainingMQService } from '@fastgpt/dal/redis/bullmq/services/datasetTraining';
import {
  closeRedisRuntime,
  configureRedisRuntime,
  getRedisRuntime
} from '@fastgpt/dal/redis/runtime';
import { vi } from 'vitest';

/** 每个用例使用独立 BullMQ 前缀，避免上一个用例的 Job、去重键或 stalled-check 影响本次执行。 */
export const openTrainingQueue = async (redisUrl: string | undefined) => {
  if (!redisUrl) throw new Error('FASTGPT_TEST_REDIS_URL must point to a dedicated test Redis');

  await closeRedisRuntime();
  configureRedisRuntime({ redisUrl });
  if (vi.isMockFunction(bullMQ.getQueue)) bullMQ.getQueue.mockRestore();
  if (vi.isMockFunction(bullMQ.getWorker)) bullMQ.getWorker.mockRestore();

  const prefix = `test-document-training-${randomUUID()}`;
  const runtime = new RedisBullMQRuntime({
    redisRuntime: getRedisRuntime(),
    hookName: prefix
  });
  const getQueue = bullMQ.getQueue.bind(bullMQ);
  const getWorker = bullMQ.getWorker.bind(bullMQ);
  const workers = new Set<{ close: () => Promise<void> }>();
  const queueBinding = vi
    .spyOn(bullMQ, 'getQueue')
    .mockImplementation((name, opts) =>
      name === QueueNames.datasetTraining
        ? runtime.getQueue(name, { ...opts, prefix })
        : getQueue(name, opts)
    );
  const workerBinding = vi
    .spyOn(bullMQ, 'getWorker')
    .mockImplementation((name, processor, opts) => {
      if (name !== QueueNames.datasetTraining) return getWorker(name, processor, opts);

      const worker = runtime.getWorker(name, processor, { ...opts, prefix });
      workers.add(worker);
      return worker;
    });
  const queue = datasetTrainingMQService.getQueue();

  return {
    prefix,
    async close() {
      try {
        await Promise.all(Array.from(workers, (worker) => worker.close()));
        await queue.obliterate({ force: true });
      } finally {
        queueBinding.mockRestore();
        workerBinding.mockRestore();
        await closeRedisRuntime();
      }
    }
  };
};
