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
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { evaluationId } = req.body;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.stopEvaluation(evaluationId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task stopped successfully', {
      evaluationId
    });

    return { message: 'Evaluation stopped successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to stop evaluation task', {
      evaluationId: req.body?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
