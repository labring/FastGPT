import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  UpdateDataItemRequest,
  UpdateDataItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvalDatasetDataKeyEnum } from '@fastgpt/global/core/evaluation/dataset/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(
  req: ApiRequestProps<UpdateDataItemRequest>
): Promise<UpdateDataItemResponse> {
  const {
    dataItemId,
    evalId,
    [EvalDatasetDataKeyEnum.UserInput]: userInput,
    [EvalDatasetDataKeyEnum.ExpectedOutput]: expectedOutput,
    [EvalDatasetDataKeyEnum.Context]: context,
    targetCallParams
  } = req.body;

  if (!dataItemId) {
    throw new Error(EvaluationErrEnum.evalDataItemIdRequired);
  }

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { evaluation, teamId, tmbId } = await authEvaluationTaskWrite(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const result = await EvaluationTaskService.updateEvaluationItemsByDataItem(
    dataItemId,
    { userInput, expectedOutput, context, targetCallParams },
    teamId,
    evalId
  );

  // Add audit log for dataItem update
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_EVALUATION_TASK_DATA_ITEM,
      params: {
        taskName: evaluation.name,
        dataItemId: dataItemId
      }
    });
  })();

  return {
    message: `Successfully updated ${result.updatedCount} evaluation items`,
    updatedCount: result.updatedCount
  };
}

export default NextAPI(handler);
export { handler };
