import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationRequest,
  DeleteEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationRequest>
): Promise<DeleteEvaluationResponse> {
  try {
    const { evalId } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.deleteEvaluation(evalId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task deleted successfully', {
      evalId: evalId
    });

    return { message: 'Evaluation deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to delete evaluation task', {
      evalId: req.query.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
