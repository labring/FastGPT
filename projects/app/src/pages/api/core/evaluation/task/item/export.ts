import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { ExportEvaluationItemsRequest } from '@fastgpt/global/core/evaluation/api';
import { authEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

async function handler(
  req: ApiRequestProps<{}, ExportEvaluationItemsRequest>,
  res: ApiResponseType<any>
) {
  try {
    const { evalId, format = 'json' } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    if (!['json', 'csv'].includes(format)) {
      return Promise.reject('Format must be json or csv');
    }

    const { teamId, tmbId, evaluation } = await authEvaluationTaskRead(evalId, {
      req,
      authApiKey: true,
      authToken: true
    });

    const { results, total } = await EvaluationTaskService.exportEvaluationResults(
      evalId,
      teamId,
      format as 'json' | 'csv'
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
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };

export const config = {
  api: {
    responseLimit: '100mb'
  }
};
