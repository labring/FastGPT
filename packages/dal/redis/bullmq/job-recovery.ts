import { LeaseCache } from '../caches';
import { bullMQ } from './binding';
import type { Queue } from './types';

const FAILED_JOB_RECOVERY_LEASE_TTL_MS = 30 * 1000;

/**
 * 添加稳定 ID 任务；若同 ID 历史任务已失败，则在分布式租约内刷新数据并手动重试。
 * 其它状态继续复用现有任务，避免并发生产者制造重复工作。
 */
export async function addOrRequeueFailedJob<DataType, ReturnType = void>({
  queue,
  name,
  data,
  opts
}: {
  queue: Queue<DataType, ReturnType>;
  name: Parameters<Queue<DataType, ReturnType>['add']>[0];
  data: Parameters<Queue<DataType, ReturnType>['add']>[1];
  opts: NonNullable<Parameters<Queue<DataType, ReturnType>['add']>[2]> & { jobId: string };
}) {
  /** unknown 可能来自 retention cleanup；二次读取确认不存在后才允许重建。 */
  const getJobWithConfirmedState = async () => {
    const job = await queue.getJob(opts.jobId);
    if (!job) return;

    const state = await job.getState();
    if (state !== 'unknown') return { job, state };

    const latestJob = await queue.getJob(opts.jobId);
    if (!latestJob) return;

    const latestState = await latestJob.getState();
    if (latestState === 'unknown') {
      throw new Error(`BullMQ job is in an unknown state: ${queue.name}/${opts.jobId}`);
    }
    return { job: latestJob, state: latestState };
  };

  const existing = await getJobWithConfirmedState();
  if (existing) {
    if (existing.state !== 'failed') return existing.job;

    const leaseCache = new LeaseCache({ logger: bullMQ.getLogger() });
    return leaseCache.withLease({
      key: `bullmq:failed-job-recovery:${queue.name}:${opts.jobId}`,
      label: 'bullmq-failed-job-recovery',
      ttlMs: FAILED_JOB_RECOVERY_LEASE_TTL_MS,
      fn: async () => {
        const current = await getJobWithConfirmedState();
        if (!current) return queue.add(name, data, opts);
        if (current.state !== 'failed') return current.job;
        const currentJob = current.job;

        try {
          await currentJob.updateData(data as DataType);
        } catch (error) {
          const latest = await getJobWithConfirmedState();
          if (!latest) return queue.add(name, data, opts);
          if (latest.state !== 'failed') return latest.job;
          throw error;
        }

        try {
          await currentJob.retry('failed');
          return currentJob;
        } catch (error) {
          const latest = await getJobWithConfirmedState();
          if (!latest) return queue.add(name, data, opts);
          if (latest.state !== 'failed') return latest.job;
          throw error;
        }
      }
    });
  }

  return queue.add(name, data, opts);
}
