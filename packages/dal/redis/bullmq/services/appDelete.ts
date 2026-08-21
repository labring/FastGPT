import { bullMQ, type BullMQBinding } from '../binding';
import { addOrRequeueFailedJob } from '../job-recovery';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type AppDeleteJobData = {
  teamId: string;
  appId: string;
};

const appDeleteQueueOptions = {
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

/** App 删除队列的业务合同和生命周期入口。 */
export class AppDeleteMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 App 删除队列；队列对象由 binding 按名称懒加载并复用。 */
  getQueue(): Queue<AppDeleteJobData> {
    return this.binding.getQueue<AppDeleteJobData>(QueueNames.appDelete, appDeleteQueueOptions);
  }

  /** 使用 service 统一的删除任务保留策略创建 App 删除 Worker。 */
  getWorker(processor: Processor<AppDeleteJobData>): Worker<AppDeleteJobData> {
    return this.binding.getWorker<AppDeleteJobData>(QueueNames.appDelete, processor, {
      concurrency: 1,
      removeOnFail: {
        age: 90 * 24 * 60 * 60,
        count: 10000
      }
    });
  }

  /** 投递幂等的 App 删除任务，并延迟一秒让请求先完成。 */
  addJob(data: AppDeleteJobData) {
    const jobId = `${String(data.teamId)}-${String(data.appId)}`;
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'delete_app',
      data,
      opts: {
        jobId,
        delay: 1000
      }
    });
  }
}

export const appDeleteMQService = new AppDeleteMQService();
