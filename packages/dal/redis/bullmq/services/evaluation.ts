import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import { fastRetryJobOptions, defaultWorkerOptions } from '../options';
import type { Processor, Queue, Worker, WorkerOptions } from '../types';

export type EvaluationJobData = {
  evalId: string;
};

/** Evaluation 队列和状态操作的业务服务。 */
export class EvaluationMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  /** 获取评测队列；队列连接在首次调用时才创建。 */
  getQueue(): Queue<EvaluationJobData> {
    return this.binding.getQueue<EvaluationJobData>(QueueNames.evaluation, {
      defaultJobOptions: fastRetryJobOptions
    });
  }

  /** 获取评测 Worker；队列状态操作和重试策略集中在 BullMQ service。 */
  getWorker(
    processor: Processor<EvaluationJobData>,
    opts?: Omit<WorkerOptions, 'connection'>
  ): Worker<EvaluationJobData> {
    return this.binding.getWorker<EvaluationJobData>(QueueNames.evaluation, processor, {
      ...defaultWorkerOptions,
      ...opts
    });
  }

  /** 投递以 evalId 去重的评测任务。 */
  addJob(data: EvaluationJobData) {
    const evalId = String(data.evalId);
    return this.getQueue().add(evalId, data, { deduplication: { id: evalId } });
  }

  /** 查询评测任务是否仍处于可执行状态。 */
  async isJobActive(evalId: string): Promise<boolean> {
    try {
      const queue = this.getQueue();
      const jobId = await queue.getDeduplicationJobId(String(evalId));
      if (!jobId) return false;

      const job = await queue.getJob(jobId);
      if (!job) return false;

      const state = await job.getState();
      return state === 'active' || state === 'waiting' || state === 'delayed';
    } catch {
      return false;
    }
  }

  /** 取消指定的评测任务。 */
  async cancelJob(evalId: string): Promise<boolean> {
    const queue = this.getQueue();
    const jobId = await queue.getDeduplicationJobId(String(evalId));
    if (!jobId) return false;

    const job = await queue.getJob(jobId);
    if (!job) return false;

    const state = await job.getState();
    if (state === 'active') {
      return false;
    }

    await job.remove();
    return true;
  }
}

export const evaluationMQService = new EvaluationMQService();
