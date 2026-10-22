import { z } from 'zod';
import { bullMQ, type BullMQBinding } from '@fastgpt/dal/redis/bullmq/binding';
import { DelayedError } from '@fastgpt/dal/redis/bullmq';
import { QueueNames } from '@fastgpt/dal/redis/bullmq/names';
import { withTimeout } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../common/logger';
import type { VectorRowsChangedCallback } from '../../../common/vectorDB/type';

const VectorRowsUpdateJobSchema = z.object({
  teamId: z.string().min(1),
  datasetId: z.string().min(1).optional()
});

export type VectorRowsUpdateJobData = z.infer<typeof VectorRowsUpdateJobSchema>;

const delay = 60_000;
const maxRetryDelay = 60 * 60_000;
const executionTimeout = 60_000;
const retention = { age: 24 * 60 * 60, count: 1000 };
const queueOptions = {
  defaultJobOptions: {
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
   * 每个节点只执行一个统计任务，启动前清除旧版本留下的全局并发上限。
   * 每轮最多等待一分钟；失败后进入延迟队列，按 1、2、4……分钟无限重试，最多延迟一小时。
   * signal 用于阻止超时后才返回的计数继续写回；底层查询仍由向量适配器的超时控制。
   */
  async getWorker(
    processor: (data: VectorRowsUpdateJobData, signal: AbortSignal) => Promise<void>
  ) {
    const queue = this.getQueue();
    await queue.removeGlobalConcurrency();

    return this.binding.getWorker<VectorRowsUpdateJobData>(
      QueueNames.vectorRowsUpdate,
      async (job, token) => {
        const data = VectorRowsUpdateJobSchema.parse(job.data);
        const controller = new AbortController();
        const deduplicationKey = queue.toKey(`de:${this.getDeduplicationId(data)}`);

        /** 开始统计前释放自己的窗口；统计期间发生的变更可以创建下一窗口。 */
        const run = async () => {
          const client = await queue.client;
          // BullMQ 5.52 的 removeDeduplicationKey 无所有权检查，不能删除新窗口的标记。
          await client.eval(
            `if redis.call('GET', KEYS[1]) == ARGV[1] then
               return redis.call('DEL', KEYS[1])
             end
             return 0`,
            1,
            deduplicationKey,
            job.id!
          );
          controller.signal.throwIfAborted();
          await processor(data, controller.signal);
        };

        try {
          await withTimeout(run(), executionTimeout, 'Vector rows update timed out');
        } catch (error) {
          controller.abort(error);
          // Redis 持久化启动次数；先限制指数，避免长期重试时数值溢出。
          const retryDelay = Math.min(
            delay * 2 ** Math.min(job.attemptsStarted - 1, 6),
            maxRetryDelay
          );
          // 已有下一窗口时由它接手；否则让事件合并到重试任务，避免故障期间堆积相同统计。
          const client = await queue.client;
          const claimed = await client.eval(
            `local owner = redis.call('GET', KEYS[1])
             if owner and owner ~= ARGV[1] then return 0 end
             redis.call('SET', KEYS[1], ARGV[1])
             return 1`,
            1,
            deduplicationKey,
            job.id!
          );
          getLogger(LogCategories.INFRA.QUEUE).warn('Vector rows update failed', {
            ...data,
            jobId: job.id,
            attempt: job.attemptsStarted,
            retryDelay: claimed ? retryDelay : undefined,
            coveredByPendingJob: !claimed,
            error
          });
          if (!claimed) return;

          // moveToDelayed 释放当前并发槽；DelayedError 告诉 Worker 该任务已自行转移状态。
          await job.moveToDelayed(Date.now() + retryDelay, token);
          throw new DelayedError();
        } finally {
          controller.abort();
        }
      },
      { concurrency: 1, removeOnComplete: { count: 0 }, removeOnFail: retention }
    );
  }
}

export const vectorRowsUpdateMQService = new VectorRowsUpdateMQService();

/** 向量变更成功后通知统计，投递最多等待三秒；故障不能让调用方重试已提交的向量。 */
export const notifyVectorRowsChanged: VectorRowsChangedCallback = async ({
  teamId,
  datasetIds
}) => {
  // lean 的 Mongo 引用运行时可能仍是 ObjectId，MQ 合同只携带稳定的字符串身份。
  const data = { teamId: String(teamId), datasetIds: datasetIds.map(String) };
  try {
    await withTimeout(
      vectorRowsUpdateMQService.pushJobs(data),
      3000,
      'Vector rows notification timed out'
    );
  } catch (error) {
    getLogger(LogCategories.INFRA.QUEUE).error('Failed to queue vector rows update', {
      ...data,
      error
    });
  }
};
