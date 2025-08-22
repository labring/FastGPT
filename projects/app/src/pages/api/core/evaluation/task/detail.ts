import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  EvaluationDetailRequest,
  EvaluationDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, EvaluationDetailRequest>
): Promise<EvaluationDetailResponse> {
  try {
    const { evalId } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const evaluation = await EvaluationTaskService.getEvaluation(evalId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task details retrieved successfully', {
      evalId: evalId,
      name: evaluation.name,
      status: evaluation.status
    });

    return evaluation;
  } catch (error) {
    addLog.error('[Evaluation] Failed to get evaluation task details', {
      evalId: req.query.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
