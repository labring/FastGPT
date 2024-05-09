import { Worker } from 'worker_threads';
import path from 'path';

export enum WorkerNameEnum {
  readFile = 'readFile',
  htmlStr2Md = 'htmlStr2Md',
  countGptMessagesTokens = 'countGptMessagesTokens'
}

export const getWorker = (name: WorkerNameEnum) => {
  const workerPath = path.join(process.cwd(), '.next', 'server', 'worker', `${name}.js`);
  return new Worker(workerPath);
};

export const runWorker = <T = any>(name: WorkerNameEnum, params?: Record<string, any>) => {
  return new Promise<T>((resolve, reject) => {
    const worker = getWorker(name);

    worker.postMessage(params);

    worker.on('message', (msg: { type: 'success' | 'error'; data: any }) => {
      if (msg.type === 'error') return reject(msg.data);

      resolve(msg.data);
    });

    worker.on('error', (err) => {
      reject(err);
      worker.terminate();
    });
    worker.on('messageerror', (err) => {
      reject(err);
      worker.terminate();
    });
  });
};
