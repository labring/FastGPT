import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  EvaluationItemDetailRequest,
  EvaluationItemDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationItemRead } from '@fastgpt/service/core/evaluation/common';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<{}, EvaluationItemDetailRequest>
): Promise<EvaluationItemDetailResponse> {
  const { evalItemId } = req.query;

  if (!evalItemId) {
    throw new Error(EvaluationErrEnum.evalItemIdRequired);
  }

  const { teamId } = await authEvaluationItemRead(evalItemId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const result = await EvaluationTaskService.getEvaluationItemResult(evalItemId, teamId);

  return result;
}

export default NextAPI(handler);
export { handler };
