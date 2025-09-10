import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';
import {
  CalculateMethodEnum,
  CaculateMethodValues
} from '@fastgpt/global/core/evaluation/constants';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import type {
  UpdateSummaryConfigBody,
  UpdateSummaryConfigResponse
} from '@fastgpt/global/core/evaluation/summary/api';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<UpdateSummaryConfigBody>
): Promise<UpdateSummaryConfigResponse> {
  // all about summary_config check
  try {
    const { evalId, calculateType, metricsConfig } = req.body || ({} as any);

    const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    // Basic parameter validation
    if (!evalId || typeof evalId !== 'string') {
      return Promise.reject(EvaluationErrEnum.evalIdRequired);
    }

    // Validate calculateType is required and valid
    if (calculateType === undefined || calculateType === null) {
      return Promise.reject(EvaluationErrEnum.summaryCalculateTypeRequired);
    }
    if (!CaculateMethodValues.includes(calculateType)) {
      return Promise.reject(EvaluationErrEnum.summaryCalculateTypeInvalid);
    }

    if (!Array.isArray(metricsConfig) || metricsConfig.length === 0) {
      return Promise.reject(EvaluationErrEnum.summaryMetricsConfigError);
    }

    // For full update, validate all required fields strictly
    for (const item of metricsConfig) {
      if (!item.metricsId || typeof item.metricsId !== 'string') {
        return Promise.reject(EvaluationErrEnum.evalMetricIdRequired);
      }

      // Threshold is required for full update
      if (item.thresholdValue === undefined || item.thresholdValue === null) {
        return Promise.reject(EvaluationErrEnum.summaryThresholdValueRequired);
      }
      if (typeof item.thresholdValue !== 'number' || Number.isNaN(item.thresholdValue)) {
        return Promise.reject(EvaluationErrEnum.summaryThresholdMustBeNumber);
      }

      // Weight is required for full update when there are multiple metrics
      if (metricsConfig.length > 1) {
        if (item.weight === undefined || item.weight === null) {
          return Promise.reject(EvaluationErrEnum.summaryWeightRequired);
        }
        if (typeof item.weight !== 'number' || Number.isNaN(item.weight)) {
          return Promise.reject(EvaluationErrEnum.summaryWeightMustBeNumber);
        }
      }
    }

    // When there are multiple metrics, validate weight sum equals 100
    if (metricsConfig.length > 1) {
      const weightSum = metricsConfig.reduce((sum, item) => sum + (item.weight || 0), 0);
      if (weightSum !== 100) {
        return Promise.reject(EvaluationErrEnum.summaryWeightSumMustBe100);
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

    // Add audit log
    addAuditLog({
      tmbId,
      teamId: teamId.toString(),
      event: AuditEventEnum.UPDATE_EVALUATION_SUMMARY_CONFIG,
      params: {
        evalName: evaluation.name
      }
    });

    return { message: 'ok' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to update summary configuration', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
