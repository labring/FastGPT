import { type MessagePort, Worker } from 'worker_threads';
import * as path from 'path';

export enum WorkerNameEnum {
  runJs = 'runJs',
  runPy = 'runPy'
}

type WorkerResponseType = { type: 'success' | 'error'; data: any };

export const getWorker = (name: WorkerNameEnum) => {
  const baseUrl =
    process.env.NODE_ENV === 'production' ? 'projects/sandbox/dist/worker' : 'dist/worker';
  const workerPath = path.join(process.cwd(), baseUrl, `${name}.js`);
  return new Worker(workerPath);
};

export const runWorker = <T = any>(name: WorkerNameEnum, params?: Record<string, any>) => {
  return new Promise<T>((resolve, reject) => {
    const worker = getWorker(name);

    worker.postMessage(params);

    worker.on('message', (msg: WorkerResponseType) => {
      if (msg.type === 'error') return reject(msg.data);

      resolve(msg.data);
      worker.terminate();
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

export const workerResponse = ({
  parentPort,
  ...data
}: WorkerResponseType & { parentPort?: MessagePort }) => {
  parentPort?.postMessage(data);
};
