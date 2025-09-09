import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StartEvaluationRequest,
  StartEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskExecution } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<StartEvaluationRequest>
): Promise<StartEvaluationResponse> {
  try {
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    const { teamId, tmbId, evaluation } = await authEvaluationTaskExecution(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    // Check AI points availability
    await checkTeamAIPoints(teamId);

    await EvaluationTaskService.startEvaluation(evalId, teamId);

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.START_EVALUATION_TASK,
        params: {
          taskName: evaluation.name
        }
      });
    })();

    return { message: 'Evaluation started successfully' };
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
