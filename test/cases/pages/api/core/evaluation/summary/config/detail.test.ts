import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { CalculateMethodEnum } from '@fastgpt/global/core/evaluation/constants';

// Import the handler function directly to test without NextAPI middleware
import { handler } from '@/pages/api/core/evaluation/summary/config/detail';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/summary', () => ({
  EvaluationSummaryService: {
    getEvaluationSummaryConfig: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id',
    evaluation: {
      _id: 'mock-eval-id',
      name: 'Mock Evaluation',
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

describe('Get Evaluation Summary Config Detail API Handler', () => {
  const mockEvalId = new Types.ObjectId().toString();

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset authEvaluationTaskRead to default success behavior
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'mock-team-id',
      tmbId: 'mock-tmb-id',
      evaluation: {
        _id: 'mock-eval-id',
        name: 'Mock Evaluation',
        status: 'completed'
      }
    });
  });

  test('应该成功获取评估总结配置详情', async () => {
    const mockConfig = {
      calculateType: CalculateMethodEnum.mean,
      calculateTypeName: '平均值',
      metricsConfig: [
        {
          metricsId: 'metric-1',
          metricsName: '准确性',
          thresholdValue: 0.8,
          weight: 50
        },
        {
          metricsId: 'metric-2',
          metricsName: '相关性',
          thresholdValue: 0.7,
          weight: 50
        }
      ]
    };

    (EvaluationSummaryService.getEvaluationSummaryConfig as any).mockResolvedValue(mockConfig);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const mockRes = {
      getHeader: vi.fn(),
      writableFinished: false
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.getEvaluationSummaryConfig).toHaveBeenCalledWith(mockEvalId);
    expect(result).toEqual({
      calculateType: CalculateMethodEnum.mean,
      calculateTypeName: '平均值',
      metricsConfig: [
        {
          metricsId: 'metric-1',
          metricsName: '准确性',
          thresholdValue: 0.8,
          weight: 50
        },
        {
          metricsId: 'metric-2',
          metricsName: '相关性',
          thresholdValue: 0.7,
          weight: 50
        }
      ]
    });
  });

  test('应该拒绝缺少 evalId 的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: {}
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝 evalId 为空字符串的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: { evalId: '' }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝 evalId 类型不正确的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: { evalId: 123 }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该正确处理服务层错误', async () => {
    const serviceError = new Error('Database connection failed');
    (EvaluationSummaryService.getEvaluationSummaryConfig as any).mockRejectedValue(serviceError);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Database connection failed');
  });

  test('应该正确处理权限验证失败', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockRejectedValue(new Error('Permission denied'));

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Permission denied');
  });

  test('应该正确处理空的配置响应', async () => {
    const emptyConfig = {
      calculateType: CalculateMethodEnum.mean,
      calculateTypeName: '平均值',
      metricsConfig: []
    };

    (EvaluationSummaryService.getEvaluationSummaryConfig as any).mockResolvedValue(emptyConfig);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.metricsConfig).toEqual([]);
    expect(result.calculateType).toBe(CalculateMethodEnum.mean);
  });

  test('应该正确处理单个指标的配置', async () => {
    const singleMetricConfig = {
      calculateType: CalculateMethodEnum.median,
      calculateTypeName: '中位数',
      metricsConfig: [
        {
          metricsId: 'metric-1',
          metricsName: '完整性',
          thresholdValue: 0.9,
          weight: 100
        }
      ]
    };

    (EvaluationSummaryService.getEvaluationSummaryConfig as any).mockResolvedValue(
      singleMetricConfig
    );

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.metricsConfig).toHaveLength(1);
    expect(result.metricsConfig[0].weight).toBe(100);
    expect(result.calculateType).toBe(CalculateMethodEnum.median);
  });
});
