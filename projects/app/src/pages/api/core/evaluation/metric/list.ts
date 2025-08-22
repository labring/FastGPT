import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { ListMetricsRequest, ListMetricsResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<ListMetricsRequest>): Promise<ListMetricsResponse> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    // Validate pagination parameters
    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
    }

    const result = await EvaluationMetricService.listMetrics(
      {
        req,
        authToken: true
      },
      pageNumInt,
      pageSizeInt,
      searchKey?.trim()
    );

    addLog.info('[Evaluation Metric] Metric list query successful', {
      pageNum: pageNumInt,
      pageSize: pageSizeInt,
      searchKey: searchKey?.trim(),
      total: result.total,
      returned: result.metrics.length
    });

    return {
      list: result.metrics,
      total: result.total
    };
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to query metric list', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
