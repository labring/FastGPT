import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationRequest,
  DeleteEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationRequest>
): Promise<DeleteEvaluationResponse> {
  const { evalId } = req.query;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  await EvaluationTaskService.deleteEvaluation(evalId, teamId);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EVALUATION_TASK,
      params: {
        taskName: evaluation.name
      }
    });
  })();

  return { message: 'Evaluation deleted successfully' };
}

export default NextAPI(handler);
export { handler };
