import { MongoEvalMetric } from './schema';
import type {
  EvalMetricSchemaType,
  CreateMetricParams
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '../../../support/permission/type';
import {
  validateResourceAccess,
  validateResourcesAccess,
  validateResourceCreate,
  validateListAccess,
  checkUpdateResult,
  checkDeleteResult
} from '../common';

// 评估指标服务
export class EvaluationMetricService {
  // 创建评估指标
  static async createMetric(
    params: CreateMetricParams,
    auth: AuthModeType
  ): Promise<EvalMetricSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    const metric = await MongoEvalMetric.create({
      ...params,
      teamId,
      tmbId
    });

    return metric.toObject();
  }

  // 获取评估指标
  static async getMetric(metricId: string, auth: AuthModeType): Promise<EvalMetricSchemaType> {
    const { resourceFilter, notFoundError } = await validateResourceAccess(
      metricId,
      auth,
      'Metric'
    );

    const metric = await MongoEvalMetric.findOne(resourceFilter).lean();

    if (!metric) {
      throw new Error(notFoundError);
    }

    return metric;
  }

  // 批量获取评估指标
  static async getMetrics(
    metricIds: string[],
    auth: AuthModeType
  ): Promise<EvalMetricSchemaType[]> {
    if (metricIds.length === 0) return [];

    const { resourceFilter } = await validateResourcesAccess(metricIds, auth, 'Metric');

    const metrics = await MongoEvalMetric.find(resourceFilter).lean();

    return metrics;
  }

  // 更新评估指标
  static async updateMetric(
    metricId: string,
    updates: Partial<CreateMetricParams>,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(metricId, auth, 'Metric');

    const result = await MongoEvalMetric.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Metric');
  }

  // 删除评估指标
  static async deleteMetric(metricId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(metricId, auth, 'Metric');

    const result = await MongoEvalMetric.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Metric');
  }

  // 获取指标列表
  static async listMetrics(
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string
  ): Promise<{
    metrics: EvalMetricSchemaType[];
    total: number;
  }> {
    const { filter, skip, limit, sort } = await validateListAccess(auth, searchKey, page, pageSize);

    const [metrics, total] = await Promise.all([
      MongoEvalMetric.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      MongoEvalMetric.countDocuments(filter)
    ]);

    return { metrics, total };
  }
}
