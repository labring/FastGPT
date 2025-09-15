import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { addLog } from '@fastgpt/service/common/system/log';
import type {
  GenerateSummaryParams,
  GenerateSummaryResponse
} from '@fastgpt/global/core/evaluation/type';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

async function handler(
  req: ApiRequestProps<GenerateSummaryParams>
): Promise<GenerateSummaryResponse> {
  try {
    const { evalId, metricIds } = req.body;

    // Validate parameters
    if (!evalId) {
      return Promise.reject(EvaluationErrEnum.evalIdRequired);
    }
    if (!metricIds || !Array.isArray(metricIds) || metricIds.length === 0) {
      return Promise.reject(EvaluationErrEnum.summaryMetricsConfigError);
    }

    // Deduplicate metricIds to avoid duplicate processing
    const uniqueMetricIds = [...new Set(metricIds)];

    if (uniqueMetricIds.length !== metricIds.length) {
      addLog.info('[EvaluationSummary] Removed duplicate metricIds in API layer', {
        evalId,
        originalCount: metricIds.length,
        uniqueCount: uniqueMetricIds.length,
        duplicates: metricIds.filter((id, index) => metricIds.indexOf(id) !== index)
      });
    }

    const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    // Check AI points availability
    await checkTeamAIPoints(teamId);

    addLog.info('[EvaluationSummary] Starting summary report generation', {
      evalId,
      metricIds: uniqueMetricIds,
      metricsCount: uniqueMetricIds.length
    });

    // Generate summary report asynchronously
    await EvaluationSummaryService.generateSummaryReports(evalId, uniqueMetricIds);

    const response: GenerateSummaryResponse = {
      success: true,
      message: 'Report generation task started'
    };

    return response;
  } catch (error) {
    addLog.error('[EvaluationSummary] Failed to start report generation task', {
      evalId: req.body?.evalId,
      metricIds: req.body?.metricIds,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
