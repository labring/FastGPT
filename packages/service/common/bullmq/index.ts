import { ConnectionOptions, Processor, Queue, QueueOptions, Worker, WorkerOptions } from 'bullmq';
import { addLog } from '../system/log';

const connection: ConnectionOptions = {
  url: process.env.REDIS_URL ?? 'redis://localhost:6379'
};

const queueOpts: QueueOptions = {
  connection,
  defaultJobOptions: {
    attempts: 3, // retry 3 times
    backoff: {
      type: 'exponential',
      delay: 1000 // delay 1 second between retries
    }
  }
};

const workerOpts: WorkerOptions = {
  connection,
  removeOnComplete: {
    age: 3600, // Keep up to 1 hour
    count: 1000 // Keep up to 1000 jobs
  },
  removeOnFail: {
    age: 24 * 3600, // Keep up to 24 hours
    count: 8000 // Keep up to 8000 jobs
  }
};

export const FinishedStates = ['completed', 'failed'] as const;

export const queues = (() => {
  if (!global.queues) {
    global.queues = new Map<string, Queue>();
  }
  return global.queues;
})();
export const workers = (() => {
  if (!global.workers) {
    global.workers = new Map<string, Worker>();
  }
  return global.workers;
})();

export function getQueue<DataType, ReturnType = any>(
  name: string,
  opts?: Omit<QueueOptions, 'connection'>
): Queue<DataType, ReturnType> {
  // check if global.queues has the queue
  const queue = queues.get(name);
  if (queue) {
    return queue as Queue<DataType, ReturnType>;
  }
  const newQueue = new Queue<DataType, ReturnType>(name, { ...queueOpts, ...opts });
  queues.set(name, newQueue);
  return newQueue;
}

export function getWorker<DataType, ReturnType = any>(
  name: string,
  processor: Processor<DataType, ReturnType>,
  opts?: Omit<WorkerOptions, 'connection'>
): Worker<DataType, ReturnType> {
  const worker = workers.get(name);
  if (worker) {
    return worker as Worker<DataType, ReturnType>;
  }
  const newWorker = new Worker<DataType, ReturnType>(name, processor, { ...workerOpts, ...opts });
  // default error handler, to avoid unhandled exceptions
  newWorker.on('error', (error) => {
    addLog.error(`MQ Worker [${name}]: ${error.message}`, error);
  });
  workers.set(name, newWorker);
  return newWorker;
}

export function getAllQueues() {
  return [...queues.values()];
}

export function getAllWorkers() {
  return [...workers.values()];
}

export async function closeAllWorkers() {
  return Promise.all(workers.values().map((worker) => worker.close()));
}
