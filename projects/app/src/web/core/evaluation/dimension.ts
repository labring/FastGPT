import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
// import type {
//   CreateMetricBody,
//   DebugMetricBody,
//   ListMetricsBody,
//   UpdateMetricBody
// } from '@fastgpt/global/core/evaluation/api';
// import type {
//   EvalMetricSchemaType,
//   EvaluationResponse
// } from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

// 临时类型定义
interface ListMetricsBody {
  current?: number;
  pageSize?: number;
  searchKey?: string;
  type?: string;
}

type CreateMetricBody = any;

type UpdateMetricBody = any;

interface DebugMetricBody {
  prompt: string;
  question: string;
  answer: string;
  reference?: string;
}

interface EvalMetricSchemaType {
  _id: string;
  name: string;
  description?: string;
  type: string;
  prompt?: string;
  scoreRange?: {
    min: number;
    max: number;
  };
  createTime: Date;
  updateTime: Date;
}

/**
 * 获取评估维度列表
 * @param data - 查询参数
 * @returns 评估维度列表数据
 */
export const getMetricList = (data: ListMetricsBody) =>
  POST<PaginationResponse<EvalMetricSchemaType>>('/core/evaluation/metric/list', data);

/**
 * 获取评估维度详情
 * @param id - 评估维度ID
 * @returns 评估维度详情
 */
export const getMetricDetail = (id: string) =>
  GET<EvalMetricSchemaType>('/core/evaluation/metric/detail', { id });

/**
 * 创建评估维度
 * @param data - 创建参数
 * @returns 创建的评估维度信息
 */
export const postCreateMetric = (data: CreateMetricBody) =>
  POST<Pick<EvalMetricSchemaType, '_id' | 'name' | 'description' | 'createTime' | 'updateTime'>>(
    '/core/evaluation/metric/create',
    data
  );

/**
 * 更新评估维度
 * @param data - 更新参数
 * @returns 更新后的评估维度信息
 */
export const putUpdateMetric = (data: UpdateMetricBody) =>
  PUT<
    Pick<
      EvalMetricSchemaType,
      '_id' | 'name' | 'description' | 'type' | 'createTime' | 'updateTime'
    >
  >('/core/evaluation/metric/update', data);

/**
 * 删除评估维度
 * @param id - 评估维度ID
 * @returns 删除结果
 */
export const deleteMetric = (id: string) => DELETE('/core/evaluation/metric/delete', { id });

/**
 * 自定义维度试运行
 * @param data - 调试参数
 * @returns 评估结果
 */
export const postDebugMetric = (data: DebugMetricBody) =>
  POST<{
    score: number;
    reason?: string;
    usages?: any[];
  }>('/core/evaluation/metric/debug', data);
