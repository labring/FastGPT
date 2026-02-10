import { getWorkerController, WorkerNameEnum } from './utils';
import { getLogger, LogCategories } from '../common/logger';

const logger = getLogger(LogCategories.APP);

export const preLoadWorker = async () => {
  const start = Date.now();
  const max = Math.min(Number(global.systemEnv?.tokenWorkers || 30), 500);
  const workerController = getWorkerController({
    name: WorkerNameEnum.countGptMessagesTokens,
    maxReservedThreads: max
  });

  // Batch size for concurrent loading
  const batchSize = 5;

  for (let i = 0; i < max; i += batchSize) {
    const currentBatchSize = Math.min(batchSize, max - i);
    const promises = [];

    // Create batch of promises for concurrent loading
    for (let j = 0; j < currentBatchSize; j++) {
      const promise = (async () => {
        const worker = workerController.createWorker();
        await workerController.run({
          workerId: worker.id,
          messages: [
            {
              role: 'user',
              content: '1'
            }
          ]
        });
      })();
      promises.push(promise);
    }

    // Wait for current batch to complete
    await Promise.all(promises);
    logger.debug('Worker preload batch completed', {
      queuedWorkers: workerController.workerQueue.length,
      batchSize: currentBatchSize,
      max
    });
  }

  logger.info('Worker preload completed', {
    queuedWorkers: workerController.workerQueue.length,
    durationMs: Date.now() - start,
    max
  });
};
