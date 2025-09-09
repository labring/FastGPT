import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { ExportDataItemsResultsRequest } from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

async function handler(req: ApiRequestProps<ExportDataItemsResultsRequest>) {
  const { evalId, format = 'json' } = req.body;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  if (format && !['csv', 'json'].includes(format)) {
    throw new Error(EvaluationErrEnum.evalInvalidFormat);
  }

  const { evaluation, teamId, tmbId } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const result = await EvaluationTaskService.exportEvaluationResultsGroupedByDataItem(
    teamId,
    evalId,
    format as 'csv' | 'json'
  );

  // Add audit log for dataItems export
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_EVALUATION_TASK_DATA_ITEMS,
      params: {
        taskName: evaluation.name,
        format,
        itemCount: result.totalItems
      }
    });
  })();

  return {
    results: result.results,
    fileName: `evaluation_${evalId}_dataItems.${format}`,
    contentType: format === 'csv' ? 'text/csv' : 'application/json'
  };
}

export default NextAPI(handler);
export { handler };
