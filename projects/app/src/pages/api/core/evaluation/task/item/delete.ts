import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationItemRequest,
  DeleteEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationItemWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationItemRequest>
): Promise<DeleteEvaluationItemResponse> {
  const { evalItemId } = req.query;

  if (!evalItemId) {
    throw new Error(EvaluationErrEnum.evalItemIdRequired);
  }

  const { evaluation, evaluationItem, teamId, tmbId } = await authEvaluationItemWrite(evalItemId, {
    req,
    authApiKey: true,
    authToken: true
  });

  await EvaluationTaskService.deleteEvaluationItem(evalItemId, teamId);

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.DELETE_EVALUATION_TASK_ITEM,
      params: {
        taskName: evaluation.name,
        itemId: String(evaluationItem._id)
      }
    });
  })();

  return { message: 'Evaluation item deleted successfully' };
}

export default NextAPI(handler);
export { handler };
