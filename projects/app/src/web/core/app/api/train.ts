import { POST, DELETE } from '@/web/common/api/request';
import type {
  CreateRerankTrainTaskResponse,
  CreateRerankTrainTaskWithTrainsetRequest,
  RetryRerankTrainTaskRequest,
  RetryRerankTrainTaskResponse,
  DeleteRerankTrainTaskRequest,
  DeleteRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import type { ListRerankTrainTasksRequest } from '@fastgpt/global/core/train/rerank/api';
import type { ListRerankTrainTasksResponse } from '@fastgpt/global/core/train/rerank/api';

/**
 * 创建训练任务（自动生成训练集）
 */
export const createRerankTrainTaskWithTrainset = (data: CreateRerankTrainTaskWithTrainsetRequest) =>
  POST<CreateRerankTrainTaskResponse>('/core/train/rerank/task/create-with-trainset', data);

/**
 * 获取训练任务列表
 */
export const getRerankTrainTaskList = (data: ListRerankTrainTasksRequest) =>
  POST<ListRerankTrainTasksResponse>('/core/train/rerank/task/list', data);

/**
 * 重试训练任务
 */
export const retryRerankTrainTask = (data: RetryRerankTrainTaskRequest) =>
  POST<RetryRerankTrainTaskResponse>('/core/train/rerank/task/retry', data);

/**
 * 删除训练任务
 */
export const deleteRerankTrainTask = (data: DeleteRerankTrainTaskRequest) =>
  DELETE<DeleteRerankTrainTaskResponse>('/core/train/rerank/task/delete', data);
