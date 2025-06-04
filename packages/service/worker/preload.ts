import { getWorkerController, WorkerNameEnum } from './utils';

export const preLoadWorker = async () => {
  const max = Math.min(Number(global.systemEnv?.tokenWorkers || 30), 100);
  const workerController = getWorkerController({
    name: WorkerNameEnum.countGptMessagesTokens,
    maxReservedThreads: max
  });

  for await (const item of new Array(max).fill(0)) {
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
    console.log(`Preload worker ${workerController.workerQueue.length}`);
  }
  console.log('Preload worker success');
};
