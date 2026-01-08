import {
  type ConnectionOptions,
  type Processor,
  Queue,
  type QueueOptions,
  Worker,
  type WorkerOptions
} from 'bullmq';
import { addLog } from '../system/log';
import { newQueueRedisConnection, newWorkerRedisConnection } from '../redis';
import { delay } from '@fastgpt/global/common/system/utils';

const defaultWorkerOpts: Omit<ConnectionOptions, 'connection'> = {
  removeOnComplete: {
    count: 0 // Delete jobs immediately on completion
  },
  removeOnFail: {
    count: 0 // Delete jobs immediately on failure
  }
};

export enum QueueNames {
  datasetSync = 'datasetSync',
  evaluation = 'evaluation',
  s3FileDelete = 's3FileDelete',

  // Delete Queue
  datasetDelete = 'datasetDelete',
  appDelete = 'appDelete',
  // @deprecated
  websiteSync = 'websiteSync'
}

export const queues = (() => {
  if (!global.queues) {
    global.queues = new Map<QueueNames, Queue>();
  }
  return global.queues;
})();
export const workers = (() => {
  if (!global.workers) {
    global.workers = new Map<QueueNames, Worker>();
  }
  return global.workers;
})();

export function getQueue<DataType, ReturnType = void>(
  name: QueueNames,
  opts?: Omit<QueueOptions, 'connection'>
): Queue<DataType, ReturnType> {
  // check if global.queues has the queue
  const queue = queues.get(name);
  if (queue) {
    return queue as Queue<DataType, ReturnType>;
  }
  const newQueue = new Queue<DataType, ReturnType>(name.toString(), {
    connection: newQueueRedisConnection(),
    ...opts
  });

  // default error handler, to avoid unhandled exceptions
  newQueue.on('error', (error) => {
    addLog.error(`MQ Queue] error`, error);
  });
  queues.set(name, newQueue);
  return newQueue;
}

export function getWorker<DataType, ReturnType = void>(
  name: QueueNames,
  processor: Processor<DataType, ReturnType>,
  opts?: Omit<WorkerOptions, 'connection'>
): Worker<DataType, ReturnType> {
  const worker = workers.get(name);
  if (worker) {
    return worker as Worker<DataType, ReturnType>;
  }

  const createWorker = () => {
    const newWorker = new Worker<DataType, ReturnType>(name.toString(), processor, {
      connection: newWorkerRedisConnection(),
      ...defaultWorkerOpts,
      // BullMQ Worker important settings
      lockDuration: 600000, // 10 minutes for large file operations
      stalledInterval: 30000, // Check for stalled jobs every 30s
      maxStalledCount: 3, // Move job to failed after 1 stall (default behavior)
      ...opts
    });

    // Worker is ready to process jobs (fired on initial connection and after reconnection)
    newWorker.on('ready', () => {
      addLog.info(`[MQ Worker] ready`, { name });
    });
    // default error handler, to avoid unhandled exceptions
    newWorker.on('error', async (error) => {
      addLog.error(`[MQ Worker] error`, {
        message: error.message,
        data: { name }
      });
    });
    // Critical: Worker has been closed - remove from pool and restart
    newWorker.on('closed', async () => {
      addLog.warn(`[MQ Worker] closed, attempting restart...`);

      // Clean up: remove all listeners to prevent memory leaks
      newWorker.removeAllListeners();

      // Retry create new worker with infinite retries
      while (true) {
        try {
          // Call getWorker to create a new worker (now workers.get(name) returns undefined)
          const worker = createWorker();
          workers.set(name, worker);
          addLog.info(`[MQ Worker] restarted successfully`);
          break;
        } catch (error) {
          addLog.error(`[MQ Worker] failed to restart, retrying...`, error);
          await delay(1000);
        }
      }
    });
    newWorker.on('paused', async () => {
      addLog.warn(`[MQ Worker] paused`);
      await delay(1000);
      newWorker.resume();
    });

    return newWorker;
  };

  const newWorker = createWorker();
  workers.set(name, newWorker);
  return newWorker;
}

export * from 'bullmq';
