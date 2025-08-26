import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StartEvaluationRequest,
  StartEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<StartEvaluationRequest>
): Promise<StartEvaluationResponse> {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { evaluationId } = req.body;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.startEvaluation(evaluationId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task started successfully', {
      evaluationId
    });

    return { message: 'Evaluation started successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to start evaluation task', {
      evaluationId: req.body?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
