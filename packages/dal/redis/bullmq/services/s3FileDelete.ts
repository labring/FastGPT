import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor, Queue, Worker } from '../types';

export type S3MQJobData = {
  key?: string;
  keys?: string[];
  prefix?: string;
  bucketName: string;
};

const s3DeleteJobOptions = {
  attempts: 10,
  removeOnFail: {
    count: 10000,
    age: 14 * 24 * 60 * 60
  },
  removeOnComplete: true,
  backoff: {
    delay: 2000,
    type: 'exponential' as const
  }
};

/** S3 文件删除队列的业务合同和生命周期入口。 */
export class S3FileDeleteMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取 S3 文件删除队列；对象存储删除 processor 由 common/s3 注入。 */
  getQueue(): Queue<S3MQJobData> {
    return this.binding.getQueue<S3MQJobData>(QueueNames.s3FileDelete);
  }

  /** 创建 S3 文件删除 Worker，统一保留策略仍由队列 service 管理。 */
  getWorker(processor: Processor<S3MQJobData>): Worker<S3MQJobData> {
    return this.binding.getWorker<S3MQJobData>(QueueNames.s3FileDelete, processor, {
      concurrency: 6
    });
  }

  /** 根据对象 key/prefix 生成幂等任务并投递到 S3 删除队列。 */
  async addJob(data: S3MQJobData): Promise<void> {
    const jobId = (() => {
      if (data.key) return data.key;
      if (data.keys) return undefined;
      if (data.prefix) return `${data.bucketName}:${data.prefix}`;
      throw new Error('Invalid s3 delete job data');
    })();

    await this.getQueue().add('delete-s3-files', data, { jobId, ...s3DeleteJobOptions });
  }
}

export const s3FileDeleteMQService = new S3FileDeleteMQService();
