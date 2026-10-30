import type { Job, Queue } from './types';

/** 单次清理最多回看的失败记录数；更旧的记录等队列变短、重新进入窗口后再清。 */
export const FAILED_JOB_SCAN_LIMIT = 1000;

/**
 * 删除被当前成功任务取代的失败记录，避免 failed 集合只增不减（保留 1 万条且无 TTL）。
 *
 * 自动 job id 在队列内单调递增，因此只删 id 更小的记录，防止并发执行的同库任务把更新的真实失败删掉。
 * 失败集合可能达到保留上限，只回看最近 `scanLimit` 条；单条删除失败交给 `onRemoveError`，
 * 扫描和整体删除的异常由调用方兜底，不应把已成功的任务判失败。
 */
export async function removeSupersededFailedJobs<DataType>({
  queue,
  job,
  match,
  scanLimit = FAILED_JOB_SCAN_LIMIT,
  onRemoveError
}: {
  queue: Queue<DataType>;
  job: Job<DataType>;
  /** 判断某条失败记录是否被本次成功执行取代 */
  match: (failedJob: Job<DataType>) => boolean;
  scanLimit?: number;
  onRemoveError?: (failedJob: Job<DataType>, error: unknown) => void;
}): Promise<void> {
  const failedCount = await queue.getFailedCount();
  if (failedCount === 0) return;

  const failedJobs = await queue.getFailed(0, Math.min(failedCount, scanLimit) - 1);
  const supersededJobs = failedJobs.filter(
    (failedJob) => Number(failedJob.id) < Number(job.id) && match(failedJob)
  );

  await Promise.all(
    supersededJobs.map((failedJob) =>
      failedJob.remove().catch((error) => onRemoveError?.(failedJob, error))
    )
  );
}
