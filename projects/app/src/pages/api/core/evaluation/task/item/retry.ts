import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  RetryEvaluationItemRequest,
  RetryEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationItemWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<RetryEvaluationItemRequest>
): Promise<RetryEvaluationItemResponse> {
  try {
    const { evalItemId } = req.body;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    const { evaluation, evaluationItem, teamId, tmbId } = await authEvaluationItemWrite(
      evalItemId,
      {
        req,
        authApiKey: true,
        authToken: true
      }
    );

    // Check AI points availability
    await checkTeamAIPoints(teamId);

    await EvaluationTaskService.retryEvaluationItem(evalItemId, teamId);

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.RETRY_EVALUATION_TASK_ITEM,
        params: {
          taskName: evaluation.name,
          itemId: String(evaluationItem._id)
        }
      });
    })();

    return { message: 'Evaluation item retry started successfully' };
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
