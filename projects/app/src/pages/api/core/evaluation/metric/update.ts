import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  MetricUpdateQuery,
  UpdateMetricBody,
  UpdateMetricResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(
  req: ApiRequestProps<UpdateMetricBody, MetricUpdateQuery>
): Promise<UpdateMetricResponse> {
  try {
    const { id } = req.query;
    const { name, description, config, dependencies } = req.body;

    if (!id) {
      return Promise.reject('Metric ID is required');
    }

    const auth = {
      req,
      authToken: true
    };

    // 验证更新参数
    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Metric name cannot be empty');
    }

    // AI模型指标的config和dependencies都是可选的，不需要额外验证

    await EvaluationMetricService.updateMetric(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(config !== undefined && { config }),
        ...(dependencies !== undefined && { dependencies })
      },
      auth
    );

    addLog.info('[Evaluation Metric] 指标更新成功', {
      metricId: id,
      updates: { name, description, hasConfig: config !== undefined }
    });

    return { message: 'Metric updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] 更新指标失败', {
      metricId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
