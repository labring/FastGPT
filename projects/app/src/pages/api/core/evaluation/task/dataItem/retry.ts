import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  RetryDataItemRequest,
  RetryDataItemResponse
} from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<RetryDataItemRequest>): Promise<RetryDataItemResponse> {
  const { dataItemId, evalId } = req.body;

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

  const result = await EvaluationTaskService.retryEvaluationItemsByDataItem(
    dataItemId,
    teamId,
    evalId
  );

  // Add audit log for dataItem retry
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.RETRY_EVALUATION_TASK_DATA_ITEM,
      params: {
        taskName: evaluation.name,
        dataItemId: dataItemId
      }
    });
  })();

  return {
    message: `Successfully retried ${result.retriedCount} evaluation items`,
    retriedCount: result.retriedCount
  };
}

export default NextAPI(handler);
export { handler };
