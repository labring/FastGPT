import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';
import { DatasetStatusEnum } from '@fastgpt/global/core/dataset/constants';

export type DatasetSyncJobData = {
  datasetId: string;
};

const repeatDuration = 24 * 60 * 60 * 1000;

/** Dataset sync 队列、scheduler 和状态转换的业务服务。 */
export class DatasetSyncMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 dataset sync 队列；队列配置在首次使用时才交给 binding。 */
  getQueue(): Queue<DatasetSyncJobData> {
    return this.binding.getQueue<DatasetSyncJobData>(QueueNames.datasetSync, {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });
  }

  /** 创建 dataset sync Worker；实际同步 processor 由 app/pro 注入。 */
  getWorker(processor: Processor<DatasetSyncJobData>): Worker<DatasetSyncJobData> {
    return this.binding.getWorker<DatasetSyncJobData>(QueueNames.datasetSync, processor, {
      removeOnFail: {
        age: 15 * 24 * 60 * 60,
        count: 1000
      },
      concurrency: 1
    });
  }

  /** 投递以 datasetId 去重的同步任务。 */
  addJob(data: DatasetSyncJobData) {
    const datasetId = String(data.datasetId);
    return this.getQueue().add(datasetId, data, { deduplication: { id: datasetId } });
  }

  /** 将 BullMQ 状态转换为业务侧 dataset sync 状态。 */
  async getDatasetStatus(datasetId: string) {
    const queue = this.getQueue();
    const jobId = await queue.getDeduplicationJobId(datasetId);
    if (!jobId) {
      return { status: DatasetStatusEnum.active, errorMsg: undefined };
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      return { status: DatasetStatusEnum.active, errorMsg: undefined };
    }

    const jobState = await job.getState();
    if (jobState === 'failed' || jobState === 'unknown') {
      return { status: DatasetStatusEnum.error, errorMsg: job.failedReason };
    }
    if (['waiting-children', 'waiting'].includes(jobState)) {
      return { status: DatasetStatusEnum.waiting, errorMsg: undefined };
    }
    if (jobState === 'active') {
      return { status: DatasetStatusEnum.syncing, errorMsg: undefined };
    }

    return { status: DatasetStatusEnum.active, errorMsg: undefined };
  }

  /** 创建或更新 dataset sync 的每日 scheduler。 */
  upsertScheduler(data: DatasetSyncJobData, startDate?: number) {
    const datasetId = String(data.datasetId);

    return this.getQueue().upsertJobScheduler(
      datasetId,
      {
        every: repeatDuration,
        startDate: startDate ?? new Date().getTime() + repeatDuration
      },
      {
        name: datasetId,
        data
      }
    );
  }

  /** 读取 dataset sync scheduler。 */
  getScheduler(datasetId: string) {
    return this.getQueue().getJobScheduler(String(datasetId));
  }

  /** 删除 dataset sync scheduler。 */
  removeScheduler(datasetId: string) {
    return this.getQueue().removeJobScheduler(String(datasetId));
  }
}

export const datasetSyncMQService = new DatasetSyncMQService();
