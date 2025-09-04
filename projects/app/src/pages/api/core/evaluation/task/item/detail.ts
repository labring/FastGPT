import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  EvaluationItemDetailRequest,
  EvaluationItemDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { authEvaluationItemRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, EvaluationItemDetailRequest>
): Promise<EvaluationItemDetailResponse> {
  try {
    const { evalItemId } = req.query;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    const { teamId } = await authEvaluationItemRead(evalItemId, {
      req,
      authApiKey: true,
      authToken: true
    });

    const result = await EvaluationTaskService.getEvaluationItemResult(evalItemId, teamId);

    addLog.info('[Evaluation] Evaluation item details query successful', {
      evalItemId: evalItemId,
      hasResponse: !!result.response,
      score: result.score
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation] Failed to query evaluation item details', {
      evalItemId: req.query?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
