import { getWorkerController, WorkerNameEnum } from './utils';

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
    console.log('Preload worker', workerController.workerQueue.length);
  }

  console.log('Preload worker success', workerController.workerQueue.length, Date.now() - start);
};
