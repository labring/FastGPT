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
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.startEvaluation(evalId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task started successfully', {
      evalId
    });

    return { message: 'Evaluation started successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to start evaluation task', {
      evalId: req.body?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
