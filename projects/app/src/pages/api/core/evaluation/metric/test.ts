import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import { createEvaluatorInstance } from '@fastgpt/service/core/evaluation/evaluator';
import type { TestMetricBody, TestMetricResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';

async function handler(req: ApiRequestProps<TestMetricBody>) {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { metricId, testCase } = req.body;

    // 验证必填字段
    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    if (!testCase) {
      return Promise.reject('Test case is required');
    }

    // 验证测试用例格式
    if (!testCase.userInput) {
      return Promise.reject('Test case must include userInput');
    }

    if (!testCase.expectedOutput) {
      return Promise.reject('Test case must include expectedOutput');
    }

    if (!testCase.actualOutput) {
      return Promise.reject('Test case must include actualOutput');
    }

    // 获取metric配置
    const metric = await EvaluationMetricService.getMetric(metricId, {
      req,
      authToken: true
    });

    // 创建evaluator进行测试，使用默认的运行时配置
    const evaluatorConfig = {
      metric,
      runtimeConfig: {} // 测试时使用默认配置
    };

    const evaluatorInstance = createEvaluatorInstance(evaluatorConfig);
    const result = await evaluatorInstance.evaluate(testCase);

    addLog.info('[Evaluation Metric] 指标测试成功', {
      metricId,
      score: result.score,
      hasError: !!result.error
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation Metric] 指标测试失败', {
      metricId: req.body?.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
