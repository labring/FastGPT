import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvaluationItemSchemaType } from '@fastgpt/global/core/evaluation/type';
import type { EvalDatasetDataSchemaType } from '@fastgpt/global/core/evaluation/dataset/type';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import type {
  UpdateEvaluationItemRequest,
  UpdateEvaluationItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateEvaluationItemRequest>
): Promise<UpdateEvaluationItemResponse> {
  try {
    const { evalItemId, userInput, expectedOutput } = req.body;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    const updates: Partial<EvaluationItemSchemaType> = {};

    if (userInput !== undefined || expectedOutput !== undefined) {
      const dataItemUpdates: Partial<EvalDatasetDataSchemaType> = {};

      if (userInput !== undefined) {
        dataItemUpdates[EvalDatasetDataKeyEnum.UserInput] = userInput;
      }
      if (expectedOutput !== undefined) {
        dataItemUpdates[EvalDatasetDataKeyEnum.ExpectedOutput] = expectedOutput;
      }

      updates.dataItem = dataItemUpdates as EvalDatasetDataSchemaType;
    }

    await EvaluationTaskService.updateEvaluationItem(evalItemId, updates, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] Evaluation item updated successfully', {
      evalItemId,
      updates: { userInput, expectedOutput }
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
