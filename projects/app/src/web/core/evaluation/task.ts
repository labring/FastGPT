import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateEvaluationRequest,
  CreateEvaluationResponse,
  ListEvaluationItemsRequest,
  ListEvaluationItemsResponse,
  ListEvaluationsRequest,
  ListEvaluationsResponse,
  UpdateEvaluationRequest,
  UpdateEvaluationResponse,
  EvaluationDetailResponse,
  DeleteEvaluationResponse,
  StartEvaluationResponse,
  StopEvaluationResponse,
  EvaluationStatsResponse,
  RetryEvaluationItemRequest,
  RetryEvaluationItemResponse,
  UpdateEvaluationItemRequest,
  UpdateEvaluationItemResponse,
  DeleteEvaluationItemResponse,
  EvaluationItemDetailResponse,
  RetryFailedItemsResponse
} from '@fastgpt/global/core/evaluation/api';

// ==================== 评估任务管理 API ====================

export const createEvaluation = (data: CreateEvaluationRequest) =>
  POST<CreateEvaluationResponse>('/core/evaluation/task/create', data);

export const getEvaluationList = (data: ListEvaluationsRequest) =>
  POST<ListEvaluationsResponse>('/core/evaluation/task/list', data);

export const getEvaluationDetail = (evalId: string) =>
  GET<EvaluationDetailResponse>(`/core/evaluation/task/detail?evalId=${evalId}`);

export const updateEvaluation = (data: UpdateEvaluationRequest) =>
  PUT<UpdateEvaluationResponse>('/core/evaluation/task/update', data);

export const deleteEvaluation = (evalId: string) =>
  DELETE<DeleteEvaluationResponse>(`/core/evaluation/task/delete?evalId=${evalId}`);

export const startEvaluation = (evalId: string) =>
  POST<StartEvaluationResponse>('/core/evaluation/task/start', { evalId });

export const stopEvaluation = (evalId: string) =>
  POST<StopEvaluationResponse>('/core/evaluation/task/stop', { evalId });

export const getEvaluationStats = (evalId: string) =>
  GET<EvaluationStatsResponse>(`/core/evaluation/task/stats?evalId=${evalId}`);

// ==================== 评估项目管理 API ====================

export const getEvalItemsList = (data: ListEvaluationItemsRequest) =>
  POST<ListEvaluationItemsResponse>('/core/evaluation/task/item/list', data);

export const getEvalItemDetail = (evalItemId: string) =>
  GET<EvaluationItemDetailResponse>(`/core/evaluation/task/item/detail?evalItemId=${evalItemId}`);

export const updateEvalItem = (data: UpdateEvaluationItemRequest) =>
  POST<UpdateEvaluationItemResponse>('/core/evaluation/task/item/update', data);

export const deleteEvalItem = (evalItemId: string) =>
  DELETE<DeleteEvaluationItemResponse>(
    `/core/evaluation/task/item/delete?evalItemId=${evalItemId}`
  );

export const retryEvalItem = (data: RetryEvaluationItemRequest) =>
  POST<RetryEvaluationItemResponse>('/core/evaluation/task/item/retry', data);

export const retryFailedItems = (evalId: string) =>
  POST<RetryFailedItemsResponse>('/core/evaluation/task/retryFailed', { evalId });

export const exportEvalItems = (evalId: string, format: 'csv' | 'json' = 'csv') =>
  GET(`/core/evaluation/task/item/export?evalId=${evalId}&format=${format}`, {
    responseType: 'blob'
  });
