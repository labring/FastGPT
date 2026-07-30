import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker, WorkerOptions } from '../types';

export type CollectionUpdateJobData = {
  teamId: string;
  datasetId: string;
  collectionId: string;
};

/** Collection update 队列的业务合同和生命周期入口。 */
export class CollectionUpdateMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 collection update 队列；队列本身不持有 Mongo processor。 */
  getQueue(): Queue<CollectionUpdateJobData> {
    return this.binding.getQueue<CollectionUpdateJobData>(QueueNames.collectionUpdate);
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
      removeOnFail: {
        count: 1000,
        age: 30 * 24 * 60 * 60
      },
      ...opts
    });
  }

  /** 以 collectionId 去重并延迟五秒投递 update 任务。 */
  async pushJob(data: CollectionUpdateJobData) {
    const jobId = `collection-update-${data.collectionId}`;

    try {
      await this.getQueue().add('updateCollection', data, {
        jobId,
        delay: 5000
      });

      this.binding.getLogger().info('Collection update job pushed', {
        collectionId: data.collectionId
      });
    } catch (error) {
      this.binding.getLogger().error('Failed to push collection update job', {
        collectionId: data.collectionId,
        error
      });
    }
  }
}

export const collectionUpdateMQService = new CollectionUpdateMQService();
