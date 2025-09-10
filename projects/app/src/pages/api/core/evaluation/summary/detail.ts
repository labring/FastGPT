import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { addLog } from '@fastgpt/service/common/system/log';
import type {
  GetEvaluationSummaryQuery,
  EvaluationSummaryResponse
} from '@fastgpt/global/core/evaluation/summary/api';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, GetEvaluationSummaryQuery>
): Promise<EvaluationSummaryResponse> {
  try {
    const { evalId } = req.query;

    // Validate parameters
    if (!evalId) {
      return Promise.reject(EvaluationErrEnum.evalIdRequired);
    }

    await authEvaluationTaskRead(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    // Get evaluation summary report
    const result = await EvaluationSummaryService.getEvaluationSummary(evalId);

    addLog.info('[Evaluation] Evaluation summary report query successful', {
      evalId,
      dataCount: result.data.length,
      aggregateScore: result.aggregateScore
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation] Failed to query evaluation summary report', {
      evalId: req.query?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
