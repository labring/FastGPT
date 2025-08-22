import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  MetricDetailRequest,
  MetricDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, MetricDetailRequest>
): Promise<MetricDetailResponse> {
  try {
    const { metricId } = req.query;

    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    const metric = await EvaluationMetricService.getMetric(metricId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Metric] Metric details retrieved successfully', {
      metricId: metricId,
      name: metric.name,
      type: metric.type
    });

    return metric;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to get metric details', {
      metricId: req.query.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
