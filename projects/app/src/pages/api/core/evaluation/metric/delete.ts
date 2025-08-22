import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  DeleteMetricRequest,
  DeleteMetricResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DeleteMetricRequest>
): Promise<DeleteMetricResponse> {
  try {
    const { metricId } = req.query;

    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    await EvaluationMetricService.deleteMetric(metricId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Metric] Metric deleted successfully', {
      metricId: metricId
    });

    return { message: 'Metric deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to delete metric', {
      metricId: req.query.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
