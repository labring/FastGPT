import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StopEvaluationRequest,
  StopEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<StopEvaluationRequest>
): Promise<StopEvaluationResponse> {
  try {
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.stopEvaluation(evalId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task stopped successfully', {
      evalId
    });

    return { message: 'Evaluation stopped successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to stop evaluation task', {
      evalId: req.body?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
