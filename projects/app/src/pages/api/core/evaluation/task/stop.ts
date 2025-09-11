import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StopEvaluationRequest,
  StopEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskExecution } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<StopEvaluationRequest>
): Promise<StopEvaluationResponse> {
  const { evalId } = req.body;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskExecution(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  await EvaluationTaskService.stopEvaluation(evalId, teamId);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.STOP_EVALUATION_TASK,
      params: {
        taskName: evaluation.name
      }
    });
  })();

  return { message: 'Evaluation stopped successfully' };
}

export default NextAPI(handler);
export { handler };
