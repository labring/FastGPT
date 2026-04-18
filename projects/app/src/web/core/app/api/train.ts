import { POST, DELETE } from '@/web/common/api/request';
import type {
  CreateRerankTrainTaskResponse,
  CreateRerankTrainTaskRequest,
  RetryRerankTrainTaskRequest,
  RetryRerankTrainTaskResponse,
  DeleteRerankTrainTaskRequest,
  DeleteRerankTrainTaskResponse,
  ListRerankTrainTasksRequest,
  ListRerankTrainTasksResponse,
  CancelRerankTrainTaskRequest,
  CancelRerankTrainTaskResponse
} from '@fastgpt/global/core/train/rerank/api';
import type {
  CreateEmbeddingTrainTaskRequest,
  CreateEmbeddingTrainTaskResponse,
  ListEmbeddingTrainTasksRequest,
  ListEmbeddingTrainTasksResponse,
  RetryEmbeddingTrainTaskRequest,
  RetryEmbeddingTrainTaskResponse,
  DeleteEmbeddingTrainTaskRequest,
  DeleteEmbeddingTrainTaskResponse
} from '@fastgpt/global/core/train/embedding/api';

/**
 * 向量模型创建训练任务
 */
export const createEmbeddingTrainTask = (data: CreateEmbeddingTrainTaskRequest) =>
  POST<CreateEmbeddingTrainTaskResponse>('/core/train/embedding/task/create', data);

/**
 * 向量模型获取训练任务列表
 */
export const getEmbeddingTrainTaskList = (data: ListEmbeddingTrainTasksRequest) =>
  POST<ListEmbeddingTrainTasksResponse>('/core/train/embedding/task/list', data);

/**
 * 向量模型重试训练任务
 */
export const retryEmbeddingTrainTask = (data: RetryEmbeddingTrainTaskRequest) =>
  POST<RetryEmbeddingTrainTaskResponse>('/core/train/embedding/task/retry', data);

/**
 * 向量模型删除训练任务
 */
export const deleteEmbeddingTrainTask = (data: DeleteEmbeddingTrainTaskRequest) =>
  DELETE<DeleteEmbeddingTrainTaskResponse>('/core/train/embedding/task/delete', data);

/**
 * 重排模型创建训练任务
 */
export const createRerankTrainTask = (data: CreateRerankTrainTaskRequest) =>
  POST<CreateRerankTrainTaskResponse>('/core/train/rerank/task/create', data);

/**
 * @deprecated 请使用 createRerankTrainTask（训练入口已从 App 迁移至训练平台）
 */
export const createRerankTrainTaskWithTrainset = (data: { appId: string }) =>
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

/**
 * @deprecated 功能已移除，应用关联训练任务的删除逻辑已解耦
 */
export const deleteAllRerankTrainTasksByApp = (data: { appId: string }) =>
  DELETE<{ message: string }>('/core/train/rerank/task/delete-all-by-app', data);
