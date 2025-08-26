import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  EvaluationDetailQuery,
  EvaluationDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, EvaluationDetailQuery>
): Promise<EvaluationDetailResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Evaluation ID is required');
    }

    const evaluation = await EvaluationTaskService.getEvaluation(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation task details retrieved successfully', {
      evaluationId: id,
      name: evaluation.name,
      status: evaluation.status
    });

    return evaluation;
  } catch (error) {
    addLog.error('[Evaluation] Failed to get evaluation task details', {
      evaluationId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
