import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { ExportEvaluationItemsQuery } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<{}, ExportEvaluationItemsQuery>,
  res: ApiResponseType<any>
) {
  try {
    const { evaluationId, format = 'json' } = req.query;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    if (!['json', 'csv'].includes(format)) {
      return Promise.reject('Format must be json or csv');
    }

    const results = await EvaluationTaskService.exportEvaluationResults(
      evaluationId,
      {
        req,
        authToken: true
      },
      format as 'json' | 'csv'
    );

    // 设置响应头
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=evaluation-${evaluationId}.csv`);
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=evaluation-${evaluationId}.json`);
    }

    addLog.info('[Evaluation] 评估项导出成功', {
      evaluationId,
      format,
      size: results.length
    });

    res.write(results);
    res.end();
  } catch (error) {
    addLog.error('[Evaluation] 导出评估项失败', {
      evaluationId: req.query?.evaluationId,
      format: req.query?.format,
      error
    });
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
