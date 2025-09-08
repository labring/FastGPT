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
import { authEvaluationItemWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<UpdateEvaluationItemRequest>
): Promise<UpdateEvaluationItemResponse> {
  try {
    const { evalItemId, userInput, expectedOutput } = req.body;

    const { evaluation, evaluationItem, teamId, tmbId } = await authEvaluationItemWrite(
      evalItemId,
      {
        req,
        authApiKey: true,
        authToken: true
      }
    );

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

    await EvaluationTaskService.updateEvaluationItem(evalItemId, updates, teamId);

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.UPDATE_EVALUATION_TASK_ITEM,
        params: {
          taskName: evaluation.name,
          itemId: String(evaluationItem._id)
        }
      });
    })();

    return { message: 'Evaluation item updated successfully' };
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
