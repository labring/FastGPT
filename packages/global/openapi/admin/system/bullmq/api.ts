import z from 'zod';
import type { PaginationResponse } from '../../../api';

// List failed jobs
export const BullmqFailedJobsBodySchema = z.object({
  queue: z.string().min(1).describe('队列名，需在白名单内'),
  pageNum: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional().describe('匹配 data 或失败原因的子串')
});
export type BullmqFailedJobsBodyType = z.infer<typeof BullmqFailedJobsBodySchema>;

// Retry failed jobs
export const BullmqRetryBodySchema = z.object({
  queue: z.string().min(1).describe('队列名，需在白名单内'),
  jobIds: z.array(z.string().min(1)).optional().describe('为空表示重试该队列全部 failed 任务')
});
export type BullmqRetryBodyType = z.infer<typeof BullmqRetryBodySchema>;

// Remove failed job records
export const BullmqRemoveBodySchema = z.object({
  queue: z.string().min(1).describe('队列名，需在白名单内'),
  jobIds: z.array(z.string().min(1)).min(1).describe('要删除的 failed 任务 id')
});
export type BullmqRemoveBodyType = z.infer<typeof BullmqRemoveBodySchema>;

export type BullmqQueueCountsType = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

export type BullmqQueueOverviewItemType = {
  name: string;
  label: string;
  counts: BullmqQueueCountsType;
  lastFailedAt?: number;
};

export type BullmqFailedJobItemType = {
  id: string;
  name?: string;
  attemptsMade: number;
  data: unknown;
  failedReason?: string;
  finishedOn?: number;
};

export type GetBullmqQueuesResponse = {
  queues: BullmqQueueOverviewItemType[];
};

export type GetBullmqFailedJobsResponse = PaginationResponse<BullmqFailedJobItemType> & {
  needFilter?: boolean;
};

export type RetryBullmqFailedJobsResponse = {
  replayed: number;
};

export type RemoveBullmqFailedJobsResponse = {
  removed: number;
};
