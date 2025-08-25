import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { CreateMetricBody, CreateMetricResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<CreateMetricBody>): Promise<CreateMetricResponse> {
  try {
    const { name, description, type, config, dependencies } = req.body;

    // 验证必填字段
    if (!name?.trim()) {
      return Promise.reject('Metric name is required');
    }

    if (!type) {
      return Promise.reject('Metric type is required');
    }

    if (!config) {
      return Promise.reject('Metric config is required');
    }

    // 验证类型和配置匹配
    switch (type) {
      case 'ai_model':
        // AI模型指标不再强制要求config字段，config和dependencies都是可选的
        break;

      default:
        return Promise.reject(
          `Unsupported metric type: ${type}. Only 'ai_model' is currently supported.`
        );
    }

    const metric = await EvaluationMetricService.createMetric(
      {
        name: name.trim(),
        description: description?.trim(),
        type,
        config,
        dependencies
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation Metric] 指标创建成功', {
      metricId: metric._id,
      name: metric.name,
      type: metric.type
    });

    return metric;
  } catch (error) {
    addLog.error('[Evaluation Metric] 创建指标失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
