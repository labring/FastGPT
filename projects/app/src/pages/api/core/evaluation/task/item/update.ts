import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvalItemSchemaType } from '@fastgpt/global/core/evaluation/type';
import type {
  UpdateEvaluationItemBody,
  UpdateEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateEvaluationItemBody>
): Promise<UpdateEvaluationItemResponse> {
  try {
    if (req.method !== 'PUT') {
      return Promise.reject('Method not allowed');
    }

    const { evalItemId, userInput, expectedOutput, variables } = req.body;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    // 构建更新对象
    const updates: Partial<EvalItemSchemaType> = {};

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

    addLog.info('[Evaluation] 评估项更新成功', {
      evalItemId,
      updates: { userInput, expectedOutput, variables }
    });

    return { message: 'Evaluation item updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 更新评估项失败', {
      evalItemId: req.body?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
