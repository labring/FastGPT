import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { ExportEvaluationItemsRequest } from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import type { localeType } from '@fastgpt/global/common/i18n/type';

async function handler(
  req: ApiRequestProps<{}, ExportEvaluationItemsRequest>,
  res: ApiResponseType<any>
) {
  const { evalId, format = 'json' } = req.query;
  const locale: localeType = getLocale(req);

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  if (!['json', 'csv'].includes(format)) {
    throw new Error(EvaluationErrEnum.evalInvalidFormat);
  }

  const { teamId, tmbId, evaluation } = await authEvaluationTaskRead(evalId, {
    req,
    authApiKey: true,
    authToken: true
  });

  const { results, total } = await EvaluationTaskService.exportEvaluationResults(
    evalId,
    teamId,
    format as 'json' | 'csv',
    locale
  );

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=evaluation-${evalId}.csv`);
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=evaluation-${evalId}.json`);
  }

  // Use total count for audit logging
  const itemCount = total;
  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.EXPORT_EVALUATION_TASK_ITEMS,
      params: {
        taskName: evaluation.name,
        format,
        itemCount
      }
    });
  })();

  res.write(results);
  res.end();
}

export default NextAPI(handler);
export { handler };

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
