import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker, WorkerOptions } from '../types';

export type CollectionUpdateJobData = {
  teamId: string;
  datasetId: string;
  collectionId: string;
};

const collectionUpdateQueueOptions = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1000
    },
    removeOnFail: true
  }
};

/** Collection update 队列的业务合同和生命周期入口。 */
export class CollectionUpdateMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 collection update 队列；队列本身不持有 Mongo processor。 */
  getQueue(): Queue<CollectionUpdateJobData> {
    return this.binding.getQueue<CollectionUpdateJobData>(
      QueueNames.collectionUpdate,
      collectionUpdateQueueOptions
    );
  }

  /** 注入领域 processor 创建 collection update Worker。 */
  getWorker(
    processor: Processor<CollectionUpdateJobData>,
    opts?: Omit<WorkerOptions, 'connection'>
  ): Worker<CollectionUpdateJobData> {
    return this.binding.getWorker<CollectionUpdateJobData>(QueueNames.collectionUpdate, processor, {
      concurrency: 3,
      removeOnComplete: {
        count: 0
      },
      ...opts,
      // 固定 jobId 需要在最终失败后释放，否则后续 collection 更新会永久撞上旧 job。
      removeOnFail: {
        count: 0
      }
    });
  }

  /** 以 collectionId 去重并延迟五秒投递 update 任务。 */
  async pushJob(data: CollectionUpdateJobData) {
    const jobId = `collection-update-${data.collectionId}`;

    try {
      const queue = this.getQueue();
      const addJob = () =>
        queue.add('updateCollection', data, {
          jobId,
          delay: 5000
        });

      // 清理旧版本可能留下的终态 job，避免迁移前的保留策略继续阻塞固定 jobId。
      const existingJob = await queue.getJob(jobId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (state === 'completed' || state === 'failed') {
          await existingJob.remove();
        }
      }

      try {
        await addJob();
      } catch (error) {
        const isDuplicateJobError =
          error instanceof Error && /already exists|duplicate/i.test(error.message);
        if (!isDuplicateJobError) throw error;

        // 并发调用可能在终态清理后争抢同一个 jobId；活动中的那一个已经代表本次更新。
        const duplicateJob = await queue.getJob(jobId);
        if (!duplicateJob) throw error;

        const state = await duplicateJob.getState();
        if (state === 'completed' || state === 'failed') {
          await duplicateJob.remove();
          await addJob();
        } else {
          this.binding.getLogger().info('Collection update job already queued', {
            collectionId: data.collectionId,
            state
          });
          return;
        }
      }

      this.binding.getLogger().info('Collection update job pushed', {
        collectionId: data.collectionId
      });
    } catch (error) {
      this.binding.getLogger().error('Failed to push collection update job', {
        collectionId: data.collectionId,
        error
      });
      throw error;
    }
  }
}

export const collectionUpdateMQService = new CollectionUpdateMQService();
