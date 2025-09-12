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
export const getEvaluationStats = (evalId: string) => {
  // TODO: 联调时需要去掉这个 mock 数据，使用真实接口
  return Promise.resolve({
    total: 20,
    completed: 15,
    evaluating: 2,
    queuing: 1,
    error: 2,
    avgScore: 85.5
  } as EvaluationStatsResponse);

  // 真实接口调用（联调时启用）
  // return GET<EvaluationStatsResponse>('/core/evaluation/task/stats', { evalId });
};

/**
 * 重试评估任务失败项
 * @param data - 重试参数
 * @returns 重试结果
 */
export const postRetryFailedEvaluationItems = (data: RetryFailedEvaluationItemsRequest) =>
  POST<RetryFailedItemsResponse>('/core/evaluation/task/retryFailed', data);

/**
 * 导出评估项
 * @param evalId - 评估任务ID
 * @param format - 导出格式
 * @returns 导出文件
 */
export const getExportEvaluationItems = (evalId: string, format?: string) =>
  GET<Blob>('/core/evaluation/task/item/export', { evalId, format });

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
export const getEvaluationItemList = (data: ListEvaluationItemsRequest) => {
  // TODO: 联调时需要去掉这个 mock 数据，使用真实接口

  // 固定的评估指标配置，所有项都使用相同的指标类型和数量
  const fixedMetrics = [
    { metricId: 'metric_1', metricName: '回答准确度' },
    { metricId: 'metric_2', metricName: '语义相似度' },
    { metricId: 'metric_3', metricName: '问题相关度' },
    { metricId: 'metric_4', metricName: '回答忠诚度' },
    { metricId: 'metric_5', metricName: '检索匹配度' }
  ];

  // return Promise.resolve({
  //   list: Array.from({ length: Number(data.pageSize || 20 }, (_, index) => {
  //     const itemIndex = ((Number(data.pageNum) || 1) - 1) * (Number(data.pageSize) || 20) + index + 1;

  //     // 随机生成状态，大部分完成，少数其他状态
  //     const randomValue = Math.random();
  //     let status: EvaluationStatusEnum;
  //     if (randomValue > 0.7) {
  //       status = EvaluationStatusEnum.completed; // 70% 完成
  //     } else if (randomValue > 0.5) {
  //       status = EvaluationStatusEnum.evaluating; // 20% 评估中
  //     } else if (randomValue > 0.3) {
  //       status = EvaluationStatusEnum.queuing; // 20% 排队中
  //     } else {
  //       status = EvaluationStatusEnum.error; // 10% 错误
  //     }

  //     return {
  //       _id: `item_${itemIndex}`,
  //       evalItemId: `item_${itemIndex}`,
  //       evalId: data.evalId,
  //       dataItem: {
  //         userInput: `这是第${itemIndex}个评估问题，用于测试评估系统的功能？`,
  //         expectedOutput: `这是第${itemIndex}个问题的标准答案，包含了详细的解答内容。`,
  //         context: [`相关上下文信息${itemIndex}`]
  //       },
  //       response:
  //         status === EvaluationStatusEnum.completed
  //           ? `这是第${itemIndex}个问题的AI回答，尽量贴近标准答案但可能存在差异。`
  //           : undefined,
  //       status,
  //       score: status === EvaluationStatusEnum.completed ? Math.random() * 40 + 60 : undefined, // 只有完成状态才有综合评分
  //       metricResults:
  //         status === EvaluationStatusEnum.completed
  //           ? fixedMetrics.map((metric) => ({
  //               metricId: metric.metricId,
  //               metricName: metric.metricName,
  //               score: Math.random() * 40 + 60 // 每个指标的评分 60-100分
  //             }))
  //           : fixedMetrics.map((metric) => ({
  //               metricId: metric.metricId,
  //               metricName: metric.metricName,
  //               score: undefined // 未完成状态没有评分
  //             })),
  //       errorMessage: status === EvaluationStatusEnum.error ? '评估过程中出现错误' : undefined,
  //       finishTime: status === EvaluationStatusEnum.completed ? new Date().toISOString() : undefined
  //     };
  //   }),
  //   total: 156 // 模拟总数
  // } as ListEvaluationItemsResponse);

  // 真实接口调用（联调时启用）
  return POST<ListEvaluationItemsResponse>('/core/evaluation/task/item/list', data);
};

/**
 * 重试评估项
 * @param data - 重试参数
 * @returns 重试结果
 */
export const postRetryEvaluationItem = (data: RetryEvaluationItemRequest) =>
  POST<RetryEvaluationItemResponse>('/core/evaluation/task/item/retry', data);
