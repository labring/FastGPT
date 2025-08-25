import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { MetricDeleteQuery, DeleteMetricResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<{}, MetricDeleteQuery>): Promise<DeleteMetricResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Metric ID is required');
    }

    await EvaluationMetricService.deleteMetric(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Metric] 指标删除成功', {
      metricId: id
    });

    return { message: 'Metric deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] 删除指标失败', {
      metricId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
