import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StatsEvaluationRequest,
  EvaluationStatsResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, StatsEvaluationRequest>
): Promise<EvaluationStatsResponse> {
  try {
    const { evalId } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const { teamId } = await authEvaluationTaskRead(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    const stats = await EvaluationTaskService.getEvaluationStats(evalId, teamId);

    return stats;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
