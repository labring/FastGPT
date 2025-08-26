import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateEvaluationRequest,
  UpdateEvaluationResponse,
  UpdateEvaluationQuery
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateEvaluationRequest, UpdateEvaluationQuery>
): Promise<UpdateEvaluationResponse> {
  try {
    const { id } = req.query;
    const { name, description } = req.body;

    if (!id) {
      return Promise.reject('Evaluation ID is required');
    }

    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Evaluation name cannot be empty');
    }

    await EvaluationTaskService.updateEvaluation(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() })
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation] Evaluation task updated successfully', {
      evaluationId: id,
      updates: { name, description }
    });

    return { message: 'Evaluation updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to update evaluation task', {
      evaluationId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
