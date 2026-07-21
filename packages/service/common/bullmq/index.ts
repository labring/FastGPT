import {
  type ConnectionOptions,
  type Processor,
  Queue,
  type QueueOptions,
  UnrecoverableError,
  Worker,
  type WorkerOptions
} from 'bullmq';
import { getLogger, LogCategories } from '../logger';
import { createQueueRedisConnection, createWorkerRedisConnection } from '../redis';
import { getRedisRuntime } from '../redis/runtime/connection';
import { delay } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.INFRA.QUEUE);
const BULLMQ_RESOURCE_CLOSE_TIMEOUT_MS = 5_000;

const closeWithTimeout = ({
  operation,
  resource
}: {
  operation: Promise<void>;
  resource: string;
}) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${resource} close timed out`)),
      BULLMQ_RESOURCE_CLOSE_TIMEOUT_MS
    );
    operation.then(resolve, reject).finally(() => clearTimeout(timeout));
  });

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
  collectionUpdate = 'collectionUpdate',
  agentSkillCreate = 'agentSkillCreate',

  // Delete Queue
  datasetDelete = 'datasetDelete',
  appDelete = 'appDelete',
  agentSkillDelete = 'agentSkillDelete',
  teamDelete = 'teamDelete',

  // Publish
  wechatPoll = 'wechatPoll',
  wechatReply = 'wechatReply',

  /** @deprecated */
  websiteSync = 'websiteSync'
}

export type BullMQRuntimeState = 'running' | 'shutting-down' | 'closed';
export type BullMQRuntimeContext = {
  queues: Map<QueueNames, Queue>;
  workers: Map<QueueNames, Worker>;
  lifecycle: BullMQRuntimeState;
  shutdownPromise?: Promise<void>;
};

/** 获取跨 Next.js 热重载复用的进程级 BullMQ 状态容器。 */
const getBullMQRuntimeContext = (): BullMQRuntimeContext => {
  global.bullMQRuntimeContext ??= {
    queues: new Map<QueueNames, Queue>(),
    workers: new Map<QueueNames, Worker>(),
    lifecycle: 'running'
  };
  return global.bullMQRuntimeContext;
};

const bullMQRuntimeContext = getBullMQRuntimeContext();
export const queues = bullMQRuntimeContext.queues;
export const workers = bullMQRuntimeContext.workers;

/** 返回进程级 BullMQ adapter 的生命周期状态。 */
export const getBullMQRuntimeState = (): BullMQRuntimeState => getBullMQRuntimeContext().lifecycle;

const assertBullMQRunning = () => {
  const state = getBullMQRuntimeState();
  if (state !== 'running') {
    throw new Error(`BullMQ runtime is ${state}`);
  }
};

/**
 * 关闭 BullMQ 拥有的 Worker/Queue 对象。
 *
 * Worker 必须先关闭，因为其内部还持有 BullMQ duplicate 出来的 blocking connection；对象池会
 * 在 close 前清空，使 `closed` 事件无法触发自动重启。Redis Runtime 通过 before-close hook
 * 调用本函数，随后再关闭传给 BullMQ 的原始 Redis connection。
 */
export const closeBullMQConnections = () => {
  const context = getBullMQRuntimeContext();
  if (context.shutdownPromise) return context.shutdownPromise;

  context.lifecycle = 'shutting-down';
  context.shutdownPromise = Promise.resolve()
    .then(async () => {
      const activeWorkers = Array.from(context.workers.entries());
      context.workers.clear();
      await Promise.all(
        activeWorkers.map(async ([name, worker]) => {
          let isClosed = false;
          await closeWithTimeout({
            operation: worker.close(true),
            resource: `BullMQ worker ${name}`
          })
            .then(() => {
              isClosed = true;
            })
            .catch((error) => {
              logger.warn('BullMQ worker close failed', { name, error });
            });
          if (isClosed) {
            worker.removeAllListeners();
          }
        })
      );

      const activeQueues = Array.from(context.queues.entries());
      context.queues.clear();
      await Promise.all(
        activeQueues.map(async ([name, queue]) => {
          let isClosed = false;
          await closeWithTimeout({
            operation: queue.close(),
            resource: `BullMQ queue ${name}`
          })
            .then(() => {
              isClosed = true;
            })
            .catch((error) => {
              logger.warn('BullMQ queue close failed', { name, error });
            });
          if (isClosed) {
            queue.removeAllListeners();
          }
        })
      );
    })
    .finally(() => {
      context.lifecycle = 'closed';
    });

  return context.shutdownPromise;
};

const defineRedisShutdownHook = () => {
  const runtime = getRedisRuntime();
  runtime.registerBeforeCloseHook({
    name: 'bullmq',
    close: closeBullMQConnections
  });
  return runtime;
};

export function getQueue<DataType, ReturnType = void>(
  name: QueueNames,
  opts?: Omit<QueueOptions, 'connection'>
): Queue<DataType, ReturnType> {
  assertBullMQRunning();
  const runtime = defineRedisShutdownHook();

  const queue = queues.get(name);
  if (queue) {
    return queue as Queue<DataType, ReturnType>;
  }
  const connection = createQueueRedisConnection();
  const newQueue = (() => {
    try {
      return new Queue<DataType, ReturnType>(name.toString(), {
        connection,
        ...opts
      });
    } catch (error) {
      void runtime.releaseConnection(connection).catch((releaseError) => {
        logger.warn('Failed to release Redis connection after BullMQ queue creation error', {
          name,
          error: releaseError
        });
      });
      throw error;
    }
  })();

  // default error handler, to avoid unhandled exceptions
  newQueue.on('error', (error) => {
    logger.error('BullMQ queue error', {
      name,
      error
    });
  });
  queues.set(name, newQueue);
  return newQueue;
}

export function getWorker<DataType, ReturnType = void>(
  name: QueueNames,
  processor: Processor<DataType, ReturnType>,
  opts?: Omit<WorkerOptions, 'connection'>
): Worker<DataType, ReturnType> {
  assertBullMQRunning();
  const runtime = defineRedisShutdownHook();

  const worker = workers.get(name);
  if (worker) {
    return worker as Worker<DataType, ReturnType>;
  }

  const createWorker = () => {
    assertBullMQRunning();
    const connection = createWorkerRedisConnection();
    const newWorker = (() => {
      try {
        return new Worker<DataType, ReturnType>(name.toString(), processor, {
          connection,
          ...defaultWorkerOpts,
          // BullMQ Worker important settings
          lockDuration: 600000, // 10 minutes for large file operations
          stalledInterval: 30000, // Check for stalled jobs every 30s
          maxStalledCount: 3, // Move job to failed after 1 stall (default behavior)
          ...opts
        });
      } catch (error) {
        void runtime.releaseConnection(connection).catch((releaseError) => {
          logger.warn('Failed to release Redis connection after BullMQ worker creation error', {
            name,
            error: releaseError
          });
        });
        throw error;
      }
    })();

    // Worker is ready to process jobs (fired on initial connection and after reconnection)
    newWorker.on('ready', () => {
      logger.info('BullMQ worker ready', { name });
    });
    // default error handler, to avoid unhandled exceptions
    newWorker.on('error', async (error) => {
      logger.error('BullMQ worker error', {
        name,
        error
      });
    });
    // 非 shutdown 导致的意外关闭才允许重启；shutdown 会先清空 pool 并切换状态。
    newWorker.on('closed', () => {
      if (workers.get(name) !== newWorker) return;
      workers.delete(name);
      newWorker.removeAllListeners();
      if (getBullMQRuntimeState() !== 'running') return;

      logger.warn('BullMQ worker closed, attempting restart', { name });

      void (async () => {
        while (getBullMQRuntimeState() === 'running') {
          try {
            const worker = createWorker();
            workers.set(name, worker);
            logger.info('BullMQ worker restarted successfully', { name });
            return;
          } catch (error) {
            logger.error('BullMQ worker restart failed, will retry', {
              name,
              error
            });
            await delay(1000);
          }
        }
      })();
    });
    newWorker.on('paused', async () => {
      if (getBullMQRuntimeState() !== 'running' || workers.get(name) !== newWorker) return;

      logger.warn('BullMQ worker paused', { name });
      await delay(1000);
      if (getBullMQRuntimeState() === 'running' && workers.get(name) === newWorker) {
        await newWorker.resume();
      }
    });

    return newWorker;
  };

  const newWorker = createWorker();
  workers.set(name, newWorker);
  return newWorker;
}

export { Queue, UnrecoverableError, Worker, delay };
export type { ConnectionOptions, Job, Processor, QueueOptions, WorkerOptions } from 'bullmq';
