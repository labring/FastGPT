import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateEvaluationResponse,
  UpdateEvaluationRequest
} from '@fastgpt/global/core/evaluation/api';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<UpdateEvaluationRequest>
): Promise<UpdateEvaluationResponse> {
  try {
    const { evalId, name, description } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    // Validate name and description with common validation utility
    const paramValidation = validateEvaluationParams(
      { name, description },
      { namePrefix: 'Evaluation' }
    );
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    const { teamId, tmbId, evaluation } = await authEvaluationTaskWrite(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    const taskName = name?.trim() || evaluation.name;

    await EvaluationTaskService.updateEvaluation(
      evalId,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() })
      },
      teamId
    );

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_EVALUATION_TASK,
        params: {
          taskName
        }
      });
    })();

    return { message: 'Evaluation updated successfully' };
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
