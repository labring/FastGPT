import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  MetricUpdateQuery,
  UpdateMetricRequest,
  UpdateMetricResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateMetricRequest, MetricUpdateQuery>
): Promise<UpdateMetricResponse> {
  try {
    const { id } = req.query;
    const { name, description, config, dependencies } = req.body;

    if (!id) {
      return Promise.reject('Metric ID is required');
    }

    const auth = {
      req,
      authToken: true
    };

    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Metric name cannot be empty');
    }

    await EvaluationMetricService.updateMetric(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(config !== undefined && { config }),
        ...(dependencies !== undefined && { dependencies })
      },
      auth
    );

    addLog.info('[Evaluation Metric] Metric updated successfully', {
      metricId: id,
      updates: { name, description, hasConfig: config !== undefined }
    });

    return { message: 'Metric updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to update metric', {
      metricId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
