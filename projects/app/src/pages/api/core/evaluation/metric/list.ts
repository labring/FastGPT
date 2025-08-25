import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { ListMetricsBody } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<ListMetricsBody>
): Promise<PaginationResponse<EvalMetricSchemaType>> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    // 验证分页参数
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

    addLog.info('[Evaluation Metric] 指标列表查询成功', {
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
    addLog.error('[Evaluation Metric] 查询指标列表失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
