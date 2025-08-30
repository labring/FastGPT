import { MongoEvalMetric } from './schema';
import type {
  EvaluationMetricSchemaType,
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

export class EvaluationMetricService {
  static async createMetric(
    params: CreateMetricParams,
    auth: AuthModeType
  ): Promise<EvaluationMetricSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    const metric = await MongoEvalMetric.create({
      ...params,
      teamId,
      tmbId
    });

    return metric.toObject();
  }

  static async getMetric(
    metricId: string,
    auth: AuthModeType
  ): Promise<EvaluationMetricSchemaType> {
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

  static async getMetrics(
    metricIds: string[],
    auth: AuthModeType
  ): Promise<EvaluationMetricSchemaType[]> {
    if (metricIds.length === 0) return [];

    const { resourceFilter } = await validateResourcesAccess(metricIds, auth, 'Metric');

    const metrics = await MongoEvalMetric.find(resourceFilter).lean();

    return metrics;
  }

  static async updateMetric(
    metricId: string,
    updates: Partial<CreateMetricParams>,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(metricId, auth, 'Metric');

    const result = await MongoEvalMetric.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Metric');
  }

  static async deleteMetric(metricId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(metricId, auth, 'Metric');

    const result = await MongoEvalMetric.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Metric');
  }

  static async listMetrics(
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string
  ): Promise<{
    metrics: EvaluationMetricSchemaType[];
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
