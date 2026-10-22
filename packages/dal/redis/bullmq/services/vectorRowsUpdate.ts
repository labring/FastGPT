import { z } from 'zod';
import { bullMQ, type BullMQBinding } from '../binding';
import { QueueNames } from '../names';
import type { Processor } from '../types';

const VectorRowsUpdateJobSchema = z.object({
  teamId: z.string().min(1),
  datasetId: z.string().min(1).optional()
});

export type VectorRowsUpdateJobData = z.infer<typeof VectorRowsUpdateJobSchema>;

const delay = 60_000;
const retention = { age: 24 * 60 * 60, count: 1000 };
const queueOptions = {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 1000 },
    removeOnComplete: true,
    removeOnFail: retention
  }
};

/** 团队和知识库分别合并统计；不同窗口使用自动 jobId，避免 active 更新被吞掉。 */
export class VectorRowsUpdateMQService {
  constructor(private readonly binding: BullMQBinding = bullMQ) {}

  getQueue() {
    return this.binding.getQueue<VectorRowsUpdateJobData>(
      QueueNames.vectorRowsUpdate,
      queueOptions
    );
  }

  /** 窗口按统计目标隔离；同团队多个库的事件只产生一个待执行团队统计。 */
  private getDeduplicationId({ teamId, datasetId }: VectorRowsUpdateJobData) {
    return datasetId === undefined ? `team/${teamId}` : `dataset/${teamId}/${datasetId}`;
  }

  /** 首次事件后一分钟执行，重复事件不重置倒计时；无 datasetId 时只通知团队。 */
  async pushJobs({ teamId, datasetIds = [] }: { teamId: string; datasetIds?: string[] }) {
    const data: VectorRowsUpdateJobData[] = [
      { teamId },
      ...[...new Set(datasetIds)].map((datasetId) => ({ teamId, datasetId }))
    ];
    return this.getQueue().addBulk(
      data.map((item) => {
        const parsed = VectorRowsUpdateJobSchema.parse(item);
        return {
          name: 'update_vector_rows',
          data: parsed,
          opts: { delay, deduplication: { id: this.getDeduplicationId(parsed) } }
        };
      })
    );
  }

  /**
   * 全局并发设置成功后才启动消费者；每个进程的 concurrency=1 不能替代全局上限。
   * 开始统计前仅释放本 job 持有的去重键，让处理期间的事件进入下一窗口。
   */
  async getWorker(processor: Processor<VectorRowsUpdateJobData>) {
    const queue = this.getQueue();
    await queue.setGlobalConcurrency(1);

    return this.binding.getWorker<VectorRowsUpdateJobData>(
      QueueNames.vectorRowsUpdate,
      async (job, token) => {
        const data = VectorRowsUpdateJobSchema.parse(job.data);
        const client = await queue.client;
        // BullMQ 5.52 的 removeDeduplicationKey 无所有权检查，不能删除新窗口的标记。
        await client.eval(
          `if redis.call('GET', KEYS[1]) == ARGV[1] then
             return redis.call('DEL', KEYS[1])
           end
           return 0`,
          1,
          queue.toKey(`de:${this.getDeduplicationId(data)}`),
          job.id!
        );
        return processor(job, token);
      },
      { concurrency: 1, removeOnComplete: { count: 0 }, removeOnFail: retention }
    );
  }
}

export const vectorRowsUpdateMQService = new VectorRowsUpdateMQService();
