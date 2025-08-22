import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  CreateMetricRequest,
  CreateMetricResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';

async function handler(req: ApiRequestProps<CreateMetricRequest>): Promise<CreateMetricResponse> {
  try {
    const { name, description, type, config, dependencies } = req.body;

    // Validate name and description
    const paramValidation = validateEvaluationParams(
      { name, description },
      { namePrefix: 'Metric' }
    );
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    if (!type) {
      return Promise.reject('Metric type is required');
    }

    if (!config) {
      return Promise.reject('Metric config is required');
    }

    switch (type) {
      case 'ai_model':
        break;
      default:
        return Promise.reject(
          `Unsupported metric type: ${type}. Only 'ai_model' is currently supported.`
        );
    }

    const metric = await EvaluationMetricService.createMetric(
      {
        name: name.trim(),
        description: description?.trim(),
        type,
        config,
        dependencies
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation Metric] Metric created successfully', {
      metricId: metric._id,
      name: metric.name,
      type: metric.type
    });

    return metric;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to create metric', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
