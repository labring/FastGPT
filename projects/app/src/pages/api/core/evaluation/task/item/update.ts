import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvaluationItemSchemaType } from '@fastgpt/global/core/evaluation/type';
import type {
  UpdateEvaluationItemRequest,
  UpdateEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateEvaluationItemRequest>
): Promise<UpdateEvaluationItemResponse> {
  try {
    const { evalItemId, userInput, expectedOutput, variables } = req.body;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    const updates: Partial<EvaluationItemSchemaType> = {};

    if (userInput !== undefined || expectedOutput !== undefined || variables !== undefined) {
      updates.dataItem = {
        userInput: userInput || '',
        expectedOutput: expectedOutput || ''
      };
      if (variables !== undefined) {
        updates.dataItem.variables = variables;
      }
    }

    await EvaluationTaskService.updateEvaluationItem(evalItemId, updates, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation item updated successfully', {
      evalItemId,
      updates: { userInput, expectedOutput, variables }
    });

    return { message: 'Evaluation item updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to update evaluation item', {
      evalItemId: req.body?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
