import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { MetricDetailQuery, MetricDetailResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<{}, MetricDetailQuery>): Promise<MetricDetailResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Metric ID is required');
    }

    const metric = await EvaluationMetricService.getMetric(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Metric] Metric details retrieved successfully', {
      metricId: id,
      name: metric.name,
      type: metric.type
    });

    return metric;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to get metric details', {
      metricId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
