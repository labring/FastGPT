import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  EvaluationDetailRequest,
  EvaluationDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, EvaluationDetailRequest>
): Promise<EvaluationDetailResponse> {
  try {
    const { evalId } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const { evaluation } = await authEvaluationTaskRead(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    // optional, if need addition handle
    // const evaluationDetails = await EvaluationTaskService.getEvaluation(evalId);

    return evaluation;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
