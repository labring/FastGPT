import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/summary/detail';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/summary', () => ({
  EvaluationSummaryService: {
    getEvaluationSummary: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
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
    error: vi.fn()
  }
}));

describe('Get Evaluation Summary Detail API Handler', () => {
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
        name: 'Mock Evaluation Task',
        status: 'completed'
      }
    });
  });

  test('应该成功获取评估总结详情', async () => {
    const mockSummary = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 85.0,
          summary: '整体表现良好，在大部分测试用例中都能提供准确的回答。',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 85
        },
        {
          metricId: 'metric-2',
          metricName: '相关性',
          metricScore: 78.7,
          summary: '回答与问题的相关性较好，但在某些复杂场景下需要改进。',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 72
        }
      ],
      aggregateScore: 81.85
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(mockSummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.getEvaluationSummary).toHaveBeenCalledWith(mockEvalId);
    expect(result).toEqual(mockSummary);
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

  test('应该拒绝 evalId 为 null 的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: { evalId: null }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝 evalId 为 undefined 的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: { evalId: undefined }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该正确处理空的总结数据', async () => {
    const emptySummary = {
      data: [],
      aggregateScore: 0
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(emptySummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data).toEqual([]);
    expect(result.aggregateScore).toBe(0);
  });

  test('应该正确处理单个指标的总结数据', async () => {
    const singleMetricSummary = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '流畅性',
          metricScore: 92.3,
          summary: '生成的文本流畅自然，语法错误极少。',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 50,
          overThresholdItemCount: 47
        }
      ],
      aggregateScore: 92.3
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(singleMetricSummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].metricName).toBe('流畅性');
    expect(result.aggregateScore).toBe(92.3);
  });

  test('应该正确处理包含错误状态的指标', async () => {
    const summaryWithError = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 85.5,
          summary: '评估完成，表现良好。',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 85
        },
        {
          metricId: 'metric-2',
          metricName: '相关性',
          metricScore: 0,
          summary: '',
          summaryStatus: SummaryStatusEnum.failed,
          errorReason: 'AI 服务超时',
          completedItemCount: 0,
          overThresholdItemCount: 0
        }
      ],
      aggregateScore: 42.75
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(summaryWithError);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data).toHaveLength(2);
    expect(result.data[1].summaryStatus).toBe(SummaryStatusEnum.failed);
    expect(result.data[1].errorReason).toBe('AI 服务超时');
  });

  test('应该正确处理生成中状态的指标', async () => {
    const summaryInProgress = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 85.5,
          summary: '',
          summaryStatus: SummaryStatusEnum.generating,
          completedItemCount: 100,
          overThresholdItemCount: 85
        }
      ],
      aggregateScore: 85.5
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(summaryInProgress);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data[0].summaryStatus).toBe(SummaryStatusEnum.generating);
    expect(result.data[0].summary).toBe('');
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

  test('应该正确处理服务层错误', async () => {
    const serviceError = new Error('Database query failed');
    (EvaluationSummaryService.getEvaluationSummary as any).mockRejectedValue(serviceError);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Database query failed');
  });

  test('应该正确记录成功的日志信息', async () => {
    const { addLog } = await import('@fastgpt/service/common/system/log');

    const mockSummary = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 85.5,
          summary: '测试总结',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 85
        }
      ],
      aggregateScore: 85.5
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(mockSummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    await handler(mockReq);

    expect(addLog.info).toHaveBeenCalledWith(
      '[Evaluation] Evaluation summary report query successful',
      {
        evalId: mockEvalId,
        dataCount: mockSummary.data.length,
        aggregateScore: mockSummary.aggregateScore
      }
    );
  });

  test('应该正确记录错误日志', async () => {
    const { addLog } = await import('@fastgpt/service/common/system/log');
    const serviceError = new Error('Service error');
    (EvaluationSummaryService.getEvaluationSummary as any).mockRejectedValue(serviceError);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    try {
      await handler(mockReq);
    } catch (error) {
      // Expected to throw
    }

    expect(addLog.error).toHaveBeenCalledWith(
      '[Evaluation] Failed to query evaluation summary report',
      {
        evalId: mockEvalId,
        error: serviceError
      }
    );
  });

  test('应该正确处理零分数的情况', async () => {
    const zeroScoreSummary = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 0,
          summary: '评估结果显示准确性较低，需要改进。',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 0
        }
      ],
      aggregateScore: 0
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(zeroScoreSummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data[0].overThresholdItemCount).toBe(0);
    expect(result.data[0].overThresholdItemCount).toBe(0);
    expect(result.aggregateScore).toBe(0);
  });

  test('应该正确处理高分数的情况', async () => {
    const highScoreSummary = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 98.7,
          summary: '评估结果优秀，准确性极高。',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 99
        }
      ],
      aggregateScore: 98.7
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(highScoreSummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data[0].overThresholdItemCount).toBe(99);
    expect(result.data[0].overThresholdItemCount).toBe(99);
    expect(result.aggregateScore).toBe(98.7);
  });

  test('应该正确处理多个指标的复杂场景', async () => {
    const complexSummary = {
      data: [
        {
          metricId: 'metric-1',
          metricName: '准确性',
          metricScore: 85.5,
          summary: '准确性良好',
          summaryStatus: SummaryStatusEnum.completed,
          completedItemCount: 100,
          overThresholdItemCount: 85
        },
        {
          metricId: 'metric-2',
          metricName: '相关性',
          metricScore: 0,
          summary: '',
          summaryStatus: SummaryStatusEnum.generating,
          completedItemCount: 0,
          overThresholdItemCount: 0
        },
        {
          metricId: 'metric-3',
          metricName: '流畅性',
          metricScore: 0,
          summary: '',
          summaryStatus: SummaryStatusEnum.failed,
          errorReason: 'Token 不足',
          completedItemCount: 50,
          overThresholdItemCount: 0
        }
      ],
      aggregateScore: 28.5
    };

    (EvaluationSummaryService.getEvaluationSummary as any).mockResolvedValue(complexSummary);

    const mockReq = {
      method: 'GET',
      query: { evalId: mockEvalId }
    } as any;

    const result = await handler(mockReq);

    expect(result.data).toHaveLength(3);
    expect(result.data[0].summaryStatus).toBe(SummaryStatusEnum.completed);
    expect(result.data[1].summaryStatus).toBe(SummaryStatusEnum.generating);
    expect(result.data[2].summaryStatus).toBe(SummaryStatusEnum.failed);
    expect(result.data[2].errorReason).toBe('Token 不足');
  });
});
