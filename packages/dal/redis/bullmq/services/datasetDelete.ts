import { bullMQ, type BullMQBinding } from '../binding';
import { addOrRequeueFailedJob } from '../job-recovery';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type DatasetDeleteJobData = {
  teamId: string;
  datasetId: string;
};

const datasetDeleteQueueOptions = {
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: 'exponential' as const,
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: { age: 30 * 24 * 60 * 60 }
  }
};

/** Dataset 删除队列的业务合同和生命周期入口。 */
export class DatasetDeleteMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 Dataset 删除队列；队列对象由 binding 按名称懒加载并复用。 */
  getQueue(): Queue<DatasetDeleteJobData> {
    return this.binding.getQueue<DatasetDeleteJobData>(
      QueueNames.datasetDelete,
      datasetDeleteQueueOptions
    );
  }

  /** 使用 service 统一的删除任务保留策略创建 Dataset 删除 Worker。 */
  getWorker(processor: Processor<DatasetDeleteJobData>): Worker<DatasetDeleteJobData> {
    return this.binding.getWorker<DatasetDeleteJobData>(QueueNames.datasetDelete, processor, {
      concurrency: 1,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    });
  }

  /** 投递幂等的 Dataset 删除任务，并延迟一秒让请求先完成。 */
  addJob(data: DatasetDeleteJobData) {
    const jobId = `${String(data.teamId)}-${String(data.datasetId)}`;
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'delete_dataset',
      data,
      opts: {
        jobId,
        delay: 1000
      }
    });
  }
}

export const datasetDeleteMQService = new DatasetDeleteMQService();
