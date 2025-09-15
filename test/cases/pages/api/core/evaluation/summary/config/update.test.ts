import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/summary/config/update';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { CalculateMethodEnum } from '@fastgpt/global/core/evaluation/constants';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/summary', () => ({
  EvaluationSummaryService: {
    updateEvaluationSummaryConfig: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskWrite: vi.fn().mockResolvedValue({
    teamId: new Types.ObjectId(),
    tmbId: 'mock-tmb-id',
    evaluation: {
      _id: 'mock-eval-id',
      name: 'Mock Evaluation Task',
      status: 'completed'
    }
  })
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Update Evaluation Summary Config API Handler', () => {
  const mockEvalId = new Types.ObjectId().toString();

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset authEvaluationTaskWrite to default success behavior
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      teamId: new Types.ObjectId(),
      tmbId: 'mock-tmb-id',
      evaluation: {
        _id: 'mock-eval-id',
        name: 'Mock Evaluation Task',
        status: 'completed'
      }
    });
    // Reset EvaluationSummaryService to default success behavior
    (EvaluationSummaryService.updateEvaluationSummaryConfig as any).mockResolvedValue(undefined);
  });

  test('应该成功更新评估总结配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          {
            metricId: 'metric-1',
            thresholdValue: 0.8,
            weight: 60
          },
          {
            metricId: 'metric-2',
            thresholdValue: 0.7,
            weight: 40
          }
        ]
      }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.updateEvaluationSummaryConfig).toHaveBeenCalledWith(
      mockEvalId,
      [
        {
          metricId: 'metric-1',
          thresholdValue: 0.8,
          weight: 60,
          calculateType: CalculateMethodEnum.mean
        },
        {
          metricId: 'metric-2',
          thresholdValue: 0.7,
          weight: 40,
          calculateType: CalculateMethodEnum.mean
        }
      ]
    );

    expect(result).toEqual({ message: 'ok' });
  });

  test('应该拒绝缺少 evalId 的请求', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        metricsConfig: [{ metricId: 'test', thresholdValue: 0.8 }]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝 evalId 为空字符串的请求', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: '',
        metricsConfig: [{ metricId: 'test', thresholdValue: 0.8 }]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝 evalId 类型不正确的请求', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: 123,
        metricsConfig: [{ metricId: 'test', thresholdValue: 0.8 }]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝空的 metricsConfig', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: []
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryMetricsConfigError);
  });

  test('应该拒绝 metricsConfig 不是数组的请求', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: 'invalid'
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryMetricsConfigError);
  });

  test('应该拒绝缺少 metricId 的指标配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          {
            thresholdValue: 0.8
          }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalMetricIdRequired);
  });

  test('应该拒绝 metricId 为空字符串的指标配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          {
            metricId: '',
            thresholdValue: 0.8
          }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalMetricIdRequired);
  });

  test('应该拒绝 thresholdValue 不是数字的指标配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          {
            metricId: 'metric-1',
            thresholdValue: 'invalid'
          }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryThresholdMustBeNumber);
  });

  test('应该拒绝 thresholdValue 为 NaN 的指标配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          {
            metricId: 'metric-1',
            thresholdValue: NaN
          }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryThresholdMustBeNumber);
  });

  test('应该拒绝 2 个或以上指标时缺少权重的配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          { metricId: 'metric-1', thresholdValue: 0.8 },
          { metricId: 'metric-2', thresholdValue: 0.7 }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryWeightRequired);
  });

  test('应该拒绝权重不是数字的配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          { metricId: 'metric-1', thresholdValue: 0.8, weight: 50 },
          { metricId: 'metric-2', thresholdValue: 0.7, weight: 'invalid' }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryWeightMustBeNumber);
  });

  test('应该拒绝权重总和不等于 100 的配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          { metricId: 'metric-1', thresholdValue: 0.8, weight: 60 },
          { metricId: 'metric-2', thresholdValue: 0.7, weight: 30 }
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryWeightSumMustBe100);
  });

  test('应该接受权重总和为 100 的配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          { metricId: 'metric-1', thresholdValue: 0.8, weight: 70 },
          { metricId: 'metric-2', thresholdValue: 0.7, weight: 30 }
        ]
      }
    } as any;

    const result = await handler(mockReq);
    expect(result).toEqual({ message: 'ok' });
  });

  test('应该要求所有指标都有权重当任一指标提供权重时', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [
          { metricId: 'metric-1', thresholdValue: 0.8, weight: 50 },
          { metricId: 'metric-2', thresholdValue: 0.7 } // 缺少权重
        ]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryWeightRequired);
  });

  test('应该接受不提供权重的单个指标配置', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [{ metricId: 'metric-1', thresholdValue: 0.8 }]
      }
    } as any;

    const result = await handler(mockReq);
    expect(result).toEqual({ message: 'ok' });
  });

  test('应该正确添加审计日志', async () => {
    const { addAuditLog } = await import('@fastgpt/service/support/user/audit/util');

    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [{ metricId: 'metric-1', thresholdValue: 0.8 }]
      }
    } as any;

    await handler(mockReq);

    expect(addAuditLog).toHaveBeenCalledWith({
      tmbId: 'mock-tmb-id',
      teamId: expect.any(String),
      event: AuditEventEnum.UPDATE_EVALUATION_SUMMARY_CONFIG,
      params: {
        evalName: 'Mock Evaluation Task'
      }
    });
  });

  test('应该正确处理服务层错误', async () => {
    const serviceError = new Error('Database update failed');
    (EvaluationSummaryService.updateEvaluationSummaryConfig as any).mockRejectedValue(serviceError);

    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.mean,
        metricsConfig: [{ metricId: 'metric-1', thresholdValue: 0.8 }]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Database update failed');
  });

  test('应该正确处理权限验证失败', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockRejectedValue(new Error('Permission denied'));

    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        metricsConfig: [{ metricId: 'metric-1', thresholdValue: 0.8 }]
      }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Permission denied');
  });

  test('应该正确处理缺少请求体的情况', async () => {
    const mockReq = {
      method: 'PUT',
      body: null
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该正确处理空的请求体', async () => {
    const mockReq = {
      method: 'PUT',
      body: {}
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该支持单个指标的配置更新', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: mockEvalId,
        calculateType: CalculateMethodEnum.median,
        metricsConfig: [
          {
            metricId: 'metric-1',
            thresholdValue: 0.9,
            weight: 100
          }
        ]
      }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.updateEvaluationSummaryConfig).toHaveBeenCalledWith(
      mockEvalId,
      [
        {
          metricId: 'metric-1',
          thresholdValue: 0.9,
          weight: 100,
          calculateType: CalculateMethodEnum.median
        }
      ]
    );

    expect(result).toEqual({ message: 'ok' });
  });
});
