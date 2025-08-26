import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  EvaluationItemDetailQuery,
  EvaluationItemDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, EvaluationItemDetailQuery>
): Promise<EvaluationItemDetailResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Evaluation item ID is required');
    }

    const result = await EvaluationTaskService.getEvaluationItemResult(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation item details query successful', {
      evalItemId: id,
      hasResponse: !!result.response,
      score: result.score
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation] Failed to query evaluation item details', {
      evalItemId: req.query?.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
