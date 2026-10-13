import type { JobsOptions, QueueOptions, WorkerOptions } from 'bullmq';

/** 统一的失败任务保留上限数量：10,000 条，不定时删除（不设 age） */
export const DEFAULT_FAILED_JOB_RETENTION_COUNT = 10000;

/** 统一的失败任务保留策略：仅按数量保留最新 10000 条，不设置按时间的 age 清理 */
export const defaultRemoveOnFail = {
  count: DEFAULT_FAILED_JOB_RETENTION_COUNT
};

/** 统一的成功完成任务清理策略：完成时立即移除 */
export const defaultRemoveOnComplete = true;

/** 默认指数退避重试策略（基础延迟 5000ms） */
export const defaultExponentialBackoff: NonNullable<JobsOptions['backoff']> = {
  type: 'exponential',
  delay: 5000
};

/** 快速指数退避重试策略（基础延迟 1000ms） */
export const fastExponentialBackoff: NonNullable<JobsOptions['backoff']> = {
  type: 'exponential',
  delay: 1000
};

/**
 * 默认 Job 选项：
 * - 尝试次数：10
 * - 重试退避：5s 指数退避 (5s, 10s, 20s, ...)
 * - 成功完成：立即清理
 * - 失败任务：保留 10000 条，不设置时间过期
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 10,
  backoff: defaultExponentialBackoff,
  removeOnComplete: defaultRemoveOnComplete,
  removeOnFail: defaultRemoveOnFail
};

/**
 * 快速/轻量业务 Job 选项（如 datasetSync、evaluation 等）：
 * - 尝试次数：3
 * - 重试退避：1s 指数退避 (1s, 2s, 4s, ...)
 * - 成功完成：立即清理
 * - 失败任务：保留 10000 条，不设置时间过期
 */
export const fastRetryJobOptions: JobsOptions = {
  attempts: 3,
  backoff: fastExponentialBackoff,
  removeOnComplete: defaultRemoveOnComplete,
  removeOnFail: defaultRemoveOnFail
};

/**
 * 默认队列级选项包装
 */
export const defaultQueueOptions: Omit<QueueOptions, 'connection'> = {
  defaultJobOptions
};

/**
 * 默认 Worker 选项（统一失败保留 10000 条）
 */
export const defaultWorkerOptions: Omit<WorkerOptions, 'connection'> = {
  removeOnFail: defaultRemoveOnFail
};
