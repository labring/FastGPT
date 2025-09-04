import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateEvaluationResponse,
  UpdateEvaluationRequest
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';

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

    const { teamId } = await authEvaluationTaskWrite(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    await EvaluationTaskService.updateEvaluation(
      evalId,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() })
      },
      teamId
    );

    addLog.info('[Evaluation] Evaluation task updated successfully', {
      evalId: evalId,
      updates: { name, description }
    });

    return { message: 'Evaluation updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to update evaluation task', {
      evalId: req.query.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
