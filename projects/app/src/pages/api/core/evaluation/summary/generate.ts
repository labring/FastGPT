import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { addLog } from '@fastgpt/service/common/system/log';
import type {
  GenerateSummaryParams,
  GenerateSummaryResponse
} from '@fastgpt/global/core/evaluation/type';

async function handler(
  req: ApiRequestProps<GenerateSummaryParams>
): Promise<GenerateSummaryResponse> {
  try {
    const { evalId, metricsIds } = req.body;

    // Validate parameters
    if (!evalId || !metricsIds || !Array.isArray(metricsIds) || metricsIds.length === 0) {
      return Promise.reject('Evaluation task ID and metrics ID array are required');
    }

    addLog.info('[EvaluationSummary] Starting summary report generation', {
      evalId,
      metricsIds,
      metricsCount: metricsIds.length
    });

    // Generate summary report asynchronously
    await EvaluationSummaryService.generateSummaryReports(evalId, metricsIds, {
      req,
      authToken: true
    });

    const response: GenerateSummaryResponse = {
      success: true,
      message: 'Report generation task started'
    };

    addLog.info('[EvaluationSummary] Report generation task started successfully', {
      evalId,
      metricsCount: metricsIds.length
    });

    return response;
  } catch (error) {
    addLog.error('[EvaluationSummary] Failed to start report generation task', {
      evalId: req.body?.evalId,
      metricsIds: req.body?.metricsIds,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
