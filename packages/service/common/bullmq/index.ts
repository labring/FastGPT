import {
  type ConnectionOptions,
  DelayedError,
  type Processor,
  Queue,
  type QueueOptions,
  UnrecoverableError,
  Worker,
  type WorkerOptions
} from 'bullmq';
import { getLogger, LogCategories } from '../logger';
import { newQueueRedisConnection, newWorkerRedisConnection } from '../redis';
import { withRedisLease } from '../redis/lock';
import { delay } from '@fastgpt/global/common/system/utils';

const logger = getLogger(LogCategories.INFRA.QUEUE);
const FAILED_JOB_RECOVERY_LEASE_TTL_MS = 30 * 1000;

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
  accountCancellation = 'accountCancellation',

  // Publish
  wechatPoll = 'wechatPoll',
  wechatReply = 'wechatReply',

  /** @deprecated */
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
    logger.error('BullMQ queue error', {
      name,
      error
    });
  });
  queues.set(name, newQueue);
  return newQueue;
}

/**
 * 添加稳定 ID 任务；若同 ID 历史任务已失败，则在分布式租约内刷新数据并手动重试。
 * 其它状态继续复用现有任务，避免并发生产者制造重复工作；租约竞争会向上抛错，
 * 由调用方或下一轮扫描重试，不能把仍处于 failed 的任务误报为已入队。
 */
export async function addOrRequeueFailedJob<DataType, ReturnType = void>({
  queue,
  name,
  data,
  opts
}: {
  queue: Queue<DataType, ReturnType>;
  name: Parameters<Queue<DataType, ReturnType>['add']>[0];
  data: Parameters<Queue<DataType, ReturnType>['add']>[1];
  opts: NonNullable<Parameters<Queue<DataType, ReturnType>['add']>[2]> & { jobId: string };
}) {
  /**
   * getJob 与 getState 之间任务可能被 retention cleanup 删除。unknown 不能视为可复用状态；
   * 重新读取后确认任务已不存在才允许使用相同稳定 ID 新建，仍存在的异常状态向上报错。
   */
  const getJobWithConfirmedState = async () => {
    const job = await queue.getJob(opts.jobId);
    if (!job) return;

    const state = await job.getState();
    if (state !== 'unknown') return { job, state };

    const latestJob = await queue.getJob(opts.jobId);
    if (!latestJob) return;

    const latestState = await latestJob.getState();
    if (latestState === 'unknown') {
      throw new Error(`BullMQ job is in an unknown state: ${queue.name}/${opts.jobId}`);
    }
    return { job: latestJob, state: latestState };
  };

  const existing = await getJobWithConfirmedState();
  if (existing) {
    if (existing.state !== 'failed') return existing.job;

    return withRedisLease({
      key: `bullmq:failed-job-recovery:${queue.name}:${opts.jobId}`,
      label: 'bullmq-failed-job-recovery',
      ttlMs: FAILED_JOB_RECOVERY_LEASE_TTL_MS,
      fn: async () => {
        // 取得租约后重新读取，避免等待期间使用过期的 failed 状态或 Job 实例。
        const current = await getJobWithConfirmedState();
        if (!current) return queue.add(name, data, opts);
        if (current.state !== 'failed') return current.job;
        const currentJob = current.job;

        // 保留 failed job，避免删除与重建之间进程退出造成任务永久丢失。
        try {
          // Queue.add 会提取 Job 联合定义的数据类型，Job.updateData 的公开泛型没有同步提取。
          await currentJob.updateData(data as DataType);
        } catch (error) {
          const latest = await getJobWithConfirmedState();
          if (!latest) return queue.add(name, data, opts);
          if (latest.state !== 'failed') return latest.job;
          throw error;
        }

        try {
          await currentJob.retry('failed');
          return currentJob;
        } catch (error) {
          // 保留真实失败；若任务已由外部操作恢复，则复用其最新状态。
          const latest = await getJobWithConfirmedState();
          if (!latest) return queue.add(name, data, opts);
          if (latest.state !== 'failed') return latest.job;
          throw error;
        }
      }
    });
  }

  return queue.add(name, data, opts);
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
      logger.info('BullMQ worker ready', { name });
    });
    // default error handler, to avoid unhandled exceptions
    newWorker.on('error', async (error) => {
      logger.error('BullMQ worker error', {
        name,
        error
      });
    });
    // Critical: Worker has been closed - remove from pool and restart
    newWorker.on('closed', async () => {
      logger.warn('BullMQ worker closed, attempting restart', { name });

      // Clean up: remove all listeners to prevent memory leaks
      newWorker.removeAllListeners();

      // Retry create new worker with infinite retries
      while (true) {
        try {
          // Call getWorker to create a new worker (now workers.get(name) returns undefined)
          const worker = createWorker();
          workers.set(name, worker);
          logger.info('BullMQ worker restarted successfully', { name });
          break;
        } catch (error) {
          logger.error('BullMQ worker restart failed, will retry', {
            name,
            error
          });
          await delay(1000);
        }
      }
    });
    newWorker.on('paused', async () => {
      logger.warn('BullMQ worker paused', { name });
      await delay(1000);
      newWorker.resume();
    });

    return newWorker;
  };

  const newWorker = createWorker();
  workers.set(name, newWorker);
  return newWorker;
}

export { DelayedError, Queue, UnrecoverableError, Worker, delay };
export type { ConnectionOptions, Job, Processor, QueueOptions, WorkerOptions } from 'bullmq';
