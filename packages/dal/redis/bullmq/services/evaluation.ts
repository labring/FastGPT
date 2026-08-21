import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
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
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });
  }

  /** 获取评测 Worker；队列状态操作和重试策略集中在 BullMQ service。 */
  getWorker(
    processor: Processor<EvaluationJobData>,
    opts?: Omit<WorkerOptions, 'connection'>
  ): Worker<EvaluationJobData> {
    return this.binding.getWorker<EvaluationJobData>(QueueNames.evaluation, processor, {
      removeOnFail: {
        count: 1000
      },
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

      const jobState = await job.getState();
      return ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState);
    } catch (error) {
      this.binding.getLogger().error('Failed to check evaluation job status', { evalId, error });
      return false;
    }
  }

  /** 删除尚未开始执行的评测任务，active/completed 任务保持原状态。 */
  async removeJob(evalId: string): Promise<boolean> {
    const formatEvalId = String(evalId);
    try {
      const queue = this.getQueue();
      const jobId = await queue.getDeduplicationJobId(formatEvalId);
      if (!jobId) {
        this.binding.getLogger().warn('No evaluation job found to remove', { evalId });
        return false;
      }

      const job = await queue.getJob(jobId);
      if (!job) {
        this.binding.getLogger().warn('Evaluation job not found in queue', { evalId, jobId });
        return false;
      }

      const jobState = await job.getState();
      if (['waiting', 'delayed', 'prioritized'].includes(jobState)) {
        await job.remove();
        this.binding.getLogger().info('Evaluation job removed successfully', {
          evalId,
          jobId,
          jobState
        });
        return true;
      }

      this.binding.getLogger().warn('Cannot remove active or completed evaluation job', {
        evalId,
        jobId,
        jobState
      });
      return false;
    } catch (error) {
      this.binding.getLogger().error('Failed to remove evaluation job', { evalId, error });
      return false;
    }
  }
}

export const evaluationMQService = new EvaluationMQService();
