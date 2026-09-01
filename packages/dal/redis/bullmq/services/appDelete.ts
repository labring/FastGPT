import { bullMQ, type BullMQBinding } from '../binding';
import { addOrRequeueFailedJob } from '../job-recovery';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type AppDeleteJobData = {
  teamId: string;
  appId: string;
  /** Historical jobs without this field are treated as root jobs. */
  jobType?: 'root' | 'app';
};

type AppDeleteAppJobInput = Omit<AppDeleteJobData, 'jobType'>;

const APP_DELETE_BULK_SIZE = 200;

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

  /** Add a root deletion job and delay it by one second for request completion. */
  addJob(data: AppDeleteJobData) {
    const jobId = `${String(data.teamId)}-${String(data.appId)}`;
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'delete_app',
      data: { ...data, jobType: 'root' },
      opts: {
        jobId,
        delay: 1000
      }
    });
  }

  /** Add one app deletion job with a stable ID for restart-safe idempotency. */
  addAppJob(data: AppDeleteAppJobInput) {
    const jobId = `app-${String(data.teamId)}-${String(data.appId)}`;
    return addOrRequeueFailedJob({
      queue: this.getQueue(),
      name: 'delete_app',
      data: { ...data, jobType: 'app' },
      opts: {
        jobId
      }
    });
  }

  /** Add app deletion jobs in BullMQ batches to avoid one Redis round trip per app. */
  async addAppJobs(data: AppDeleteAppJobInput[]) {
    if (data.length === 0) return [];

    const queue = this.getQueue();
    const jobs = data.map((item) => ({
      name: 'delete_app' as const,
      data: { ...item, jobType: 'app' as const },
      opts: {
        jobId: `app-${String(item.teamId)}-${String(item.appId)}`
      }
    }));
    const results = [];

    for (let index = 0; index < jobs.length; index += APP_DELETE_BULK_SIZE) {
      results.push(...(await queue.addBulk(jobs.slice(index, index + APP_DELETE_BULK_SIZE))));
    }

    return results;
  }
}

export const appDeleteMQService = new AppDeleteMQService();
