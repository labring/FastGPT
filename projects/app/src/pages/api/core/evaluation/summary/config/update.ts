import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';
import type { CalculateMethodEnum } from '@fastgpt/global/core/evaluation/constants';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import type {
  UpdateSummaryConfigBody,
  UpdateSummaryConfigResponse
} from '@fastgpt/global/core/evaluation/summary/api';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<UpdateSummaryConfigBody>
): Promise<UpdateSummaryConfigResponse> {
  try {
    const { evalId, calculateType, metricsConfig } = req.body || ({} as any);

    await authEvaluationTaskWrite(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    // Basic parameter validation
    if (!evalId || typeof evalId !== 'string') {
      return Promise.reject('evalId is required');
    }

    if (!Array.isArray(metricsConfig) || metricsConfig.length === 0) {
      return Promise.reject('metricsConfig cannot be empty');
    }

    // Additional rule: when metricsConfig length >= 3, weight is required
    const needWeight = metricsConfig.length >= 3;
    for (const item of metricsConfig) {
      if (!item.metricsId || typeof item.metricsId !== 'string') {
        return Promise.reject('metricsConfig.metricsId is required');
      }
      if (typeof item.thresholdValue !== 'number' || Number.isNaN(item.thresholdValue)) {
        return Promise.reject('metricsConfig.thresholdValue must be a number');
      }
      if (needWeight && (typeof item.weight !== 'number' || Number.isNaN(item.weight))) {
        return Promise.reject(
          'When configuring 3 or more metrics, metricsConfig.weight must be a number'
        );
      }
    }

    // Add calculateType to each metric configuration
    const metricsConfigWithCalculateType = metricsConfig.map((metric) => ({
      metricsId: metric.metricsId,
      thresholdValue: metric.thresholdValue as number,
      weight: metric.weight,
      calculateType: calculateType
    }));

    await EvaluationSummaryService.updateEvaluationSummaryConfig(
      evalId,
      metricsConfigWithCalculateType
    );

    addLog.info('[Evaluation] Summary configuration updated successfully', {
      evalId,
      metricCount: metricsConfig.length
    });

    return { message: 'ok' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to update summary configuration', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
