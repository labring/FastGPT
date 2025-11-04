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
  // abondoned
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
    addLog.error(`MQ Queue [${name}]: ${error.message}`, error);
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

  const newWorker = new Worker<DataType, ReturnType>(name.toString(), processor, {
    connection: newWorkerRedisConnection(),
    ...defaultWorkerOpts,
    ...opts
  });
  // default error handler, to avoid unhandled exceptions
  newWorker.on('error', (error) => {
    addLog.error(`MQ Worker [${name}]: ${error.message}`, error);
  });
  newWorker.on('failed', (jobId, error) => {
    addLog.error(`MQ Worker [${name}]: ${error.message}`, error);
  });
  workers.set(name, newWorker);
  return newWorker;
}

export * from 'bullmq';
