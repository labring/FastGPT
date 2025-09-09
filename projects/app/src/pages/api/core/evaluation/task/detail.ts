import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  EvaluationDetailRequest,
  EvaluationDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<{}, EvaluationDetailRequest>
): Promise<EvaluationDetailResponse> {
  const { evalId } = req.query;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { evaluation } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  // optional, if need addition handle
  // const evaluationDetails = await EvaluationTaskService.getEvaluation(evalId);

  return evaluation;
}

export default NextAPI(handler);
export { handler };
