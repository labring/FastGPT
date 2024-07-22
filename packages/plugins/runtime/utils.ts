import { addLog } from '@fastgpt/service/common/system/log';
import { getSafeEnv } from '@fastgpt/service/worker/utils';
import path from 'path';
import { Worker } from 'worker_threads';

export const getWorker = () => {
  const workerPath = path.join(process.cwd(), '.next', 'server', 'worker', `systemPluginRun.js`);
  return new Worker(workerPath, {
    env: getSafeEnv()
  });
};

export const runWorker = <T = any>(name: string, data?: Record<string, any>) => {
  return new Promise<T>((resolve, reject) => {
    const start = Date.now();
    const worker = getWorker();

    worker.postMessage({
      name,
      data
    });

    worker.on('message', (msg: { type: 'success' | 'error'; data: any }) => {
      if (msg.type === 'error') return reject(msg.data);

      resolve(msg.data);

      const time = Date.now() - start;
      if (time > 1000) {
        addLog.info(`Worker ${name} run time: ${time}ms`);
      }
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
