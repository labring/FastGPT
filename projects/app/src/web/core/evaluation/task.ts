import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type {
  CreateEvaluationRequest,
  CreateEvaluationResponse,
  UpdateEvaluationRequest,
  UpdateEvaluationResponse,
  EvaluationDetailRequest,
  EvaluationDetailResponse,
  DeleteEvaluationRequest,
  DeleteEvaluationResponse,
  ListEvaluationsRequest,
  ListEvaluationsResponse,
  StartEvaluationRequest,
  StartEvaluationResponse,
  StopEvaluationRequest,
  StopEvaluationResponse,
  StatsEvaluationRequest,
  EvaluationStatsResponse,
  ExportEvaluationItemsRequest,
  RetryFailedEvaluationItemsRequest,
  RetryFailedItemsResponse,
  ListEvaluationItemsRequest,
  ListEvaluationItemsResponse,
  EvaluationItemDetailRequest,
  EvaluationItemDetailResponse,
  UpdateEvaluationItemRequest,
  UpdateEvaluationItemResponse,
  RetryEvaluationItemRequest,
  RetryEvaluationItemResponse,
  DeleteEvaluationItemRequest,
  DeleteEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import type {
  GetEvaluationSummaryQuery,
  EvaluationSummaryResponse,
  UpdateSummaryConfigBody,
  UpdateSummaryConfigResponse,
  GetConfigDetailQuery,
  GetConfigDetailResponse
} from '@fastgpt/global/core/evaluation/summary/api';
import type {
  GenerateSummaryParams,
  GenerateSummaryResponse
} from '@fastgpt/global/core/evaluation/type';

// ====== 评估任务管理 API ======

/**
 * 创建评估任务
 * @param data - 创建参数
 * @returns 创建的评估任务信息
 */
export const postCreateEvaluation = (data: CreateEvaluationRequest) =>
  POST<CreateEvaluationResponse>('/core/evaluation/task/create', data);

/**
 * 删除评估任务
 * @param evalId - 评估任务ID
 * @returns 删除结果
 */
export const deleteEvaluation = (evalId: string) =>
  DELETE<DeleteEvaluationResponse>('/core/evaluation/task/delete', { evalId });

/**
 * 更新评估任务
 * @param data - 更新参数
 * @returns 更新结果
 */
export const putUpdateEvaluation = (data: UpdateEvaluationRequest) =>
  PUT<UpdateEvaluationResponse>('/core/evaluation/task/update', data);

/**
 * 获取评估任务详情
 * @param evalId - 评估任务ID
 * @returns 评估任务详情
 */
export const getEvaluationDetail = (evalId: string) =>
  GET<EvaluationDetailResponse>('/core/evaluation/task/detail', { evalId });

/**
 * 获取评估任务列表
 * @param data - 查询参数
 * @returns 评估任务列表数据
 */
export const getEvaluationList = (data: ListEvaluationsRequest) =>
  POST<ListEvaluationsResponse>('/core/evaluation/task/list', data);

/**
 * 启动评估任务
 * @param data - 启动参数
 * @returns 启动结果
 */
export const postStartEvaluation = (data: StartEvaluationRequest) =>
  POST<StartEvaluationResponse>('/core/evaluation/task/start', data);

/**
 * 停止评估任务
 * @param data - 停止参数
 * @returns 停止结果
 */
export const postStopEvaluation = (data: StopEvaluationRequest) =>
  POST<StopEvaluationResponse>('/core/evaluation/task/stop', data);

/**
 * 获取评估统计信息
 * @param evalId - 评估任务ID
 * @returns 统计信息
 */
export const getEvaluationStats = (evalId: string) =>
  GET<EvaluationStatsResponse>('/core/evaluation/task/stats', { evalId });

/**
 * 重试评估任务失败项
 * @param data - 重试参数
 * @returns 重试结果
 */
export const postRetryFailedEvaluationItems = (data: RetryFailedEvaluationItemsRequest) =>
  POST<RetryFailedItemsResponse>('/core/evaluation/task/retryFailed', data);

// ====== 评估项 API ======

/**
 * 导出评估项
 * @param evalId - 评估任务ID
 * @param format - 导出格式
 * @returns 导出文件
 */
export const getExportEvaluationItems = (evalId: string, format?: string) => {
  const params = new URLSearchParams({ evalId });
  if (format) {
    params.append('format', format);
  }

  return fetch(`/api/core/evaluation/task/item/export?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.blob();
  });
};

/**
 * 删除评估项
 * @param evalItemId - 评估项ID
 * @returns 删除结果
 */
export const deleteEvaluationItem = (evalItemId: string) =>
  DELETE<DeleteEvaluationItemResponse>('/core/evaluation/task/item/delete', { evalItemId });

/**
 * 更新评估项
 * @param data - 更新参数
 * @returns 更新结果
 */
export const putUpdateEvaluationItem = (data: UpdateEvaluationItemRequest) =>
  PUT<UpdateEvaluationItemResponse>('/core/evaluation/task/item/update', data);

/**
 * 获取评估项详情
 * @param evalItemId - 评估项ID
 * @returns 评估项详情
 */
export const getEvaluationItemDetail = (evalItemId: string) =>
  GET<EvaluationItemDetailResponse>('/core/evaluation/task/item/detail', { evalItemId });

/**
 * 获取评估项列表
 * @param data - 查询参数
 * @returns 评估项列表数据
 */
export const getEvaluationItemList = (data: ListEvaluationItemsRequest) =>
  POST<ListEvaluationItemsResponse>('/core/evaluation/task/item/list', data);

/**
 * 重试评估项
 * @param data - 重试参数
 * @returns 重试结果
 */
export const postRetryEvaluationItem = (data: RetryEvaluationItemRequest) =>
  POST<RetryEvaluationItemResponse>('/core/evaluation/task/item/retry', data);

// ====== 评估总结报告 API ======

/**
 * 获取总结报告
 * @param evalId - 评估任务ID
 * @returns 总结报告数据
 */
export const getEvaluationSummary = (evalId: string) =>
  GET<EvaluationSummaryResponse>('/core/evaluation/summary/detail', { evalId });

/**
 * 配置权重、阈值
 * @param data - 配置参数
 * @returns 配置结果
 */
export const postUpdateSummaryConfig = (data: UpdateSummaryConfigBody) =>
  POST<UpdateSummaryConfigResponse>('/core/evaluation/summary/config/update', data);

/**
 * 获取评估任务配置
 * @param evalId - 评估任务ID
 * @returns 配置详情
 */
export const getSummaryConfigDetail = (evalId: string) =>
  GET<GetConfigDetailResponse>('/core/evaluation/summary/config/detail', { evalId });

/**
 * 生成指定指标的总结报告
 * @param data - 生成参数
 * @returns 生成结果
 */
export const postGenerateSummary = (data: GenerateSummaryParams) =>
  POST<GenerateSummaryResponse>('/core/evaluation/summary/create', data);
