import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StartEvaluationRequest,
  StartEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { authEvaluationTaskExecution } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<StartEvaluationRequest>
): Promise<StartEvaluationResponse> {
  try {
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const { teamId } = await authEvaluationTaskExecution(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    await EvaluationTaskService.startEvaluation(evalId, teamId);

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
