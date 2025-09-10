import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/summary/create';
import { EvaluationSummaryService } from '@fastgpt/service/core/evaluation/summary';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/summary', () => ({
  EvaluationSummaryService: {
    generateSummaryReports: vi.fn()
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

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn().mockResolvedValue(true)
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('Create Evaluation Summary API Handler', () => {
  const mockEvalId = new Types.ObjectId().toString();
  const mockMetricsIds = ['metric-1', 'metric-2', 'metric-3'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功创建评估总结报告', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    const result = await handler(mockReq);

    expect(checkTeamAIPoints).toHaveBeenCalled();
    expect(EvaluationSummaryService.generateSummaryReports).toHaveBeenCalledWith(
      mockEvalId,
      mockMetricsIds
    );
    expect(result).toEqual({
      success: true,
      message: 'Report generation task started'
    });
  });

  test('应该拒绝缺少 evalId 的请求', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        metricsIds: mockMetricsIds
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝 evalId 为空字符串的请求', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: '',
        metricsIds: mockMetricsIds
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该拒绝缺少 metricsIds 的请求', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryMetricsConfigError);
  });

  test('应该拒绝 metricsIds 不是数组的请求', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: 'invalid'
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryMetricsConfigError);
  });

  test('应该拒绝空的 metricsIds 数组', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: []
      }
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.summaryMetricsConfigError);
  });

  test('应该正确处理单个指标ID', async () => {
    const singleMetricId = ['metric-1'];
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: singleMetricId
      }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.generateSummaryReports).toHaveBeenCalledWith(
      mockEvalId,
      singleMetricId
    );
    expect(result).toEqual({
      success: true,
      message: 'Report generation task started'
    });
  });

  test('应该正确处理多个指标ID', async () => {
    const multipleMetricsIds = ['metric-1', 'metric-2', 'metric-3', 'metric-4', 'metric-5'];
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: multipleMetricsIds
      }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.generateSummaryReports).toHaveBeenCalledWith(
      mockEvalId,
      multipleMetricsIds
    );
    expect(result).toEqual({
      success: true,
      message: 'Report generation task started'
    });
  });

  test('应该正确处理 AI 点数不足的情况', async () => {
    const insufficientPointsError = new Error('Insufficient AI points');
    (checkTeamAIPoints as any).mockRejectedValue(insufficientPointsError);

    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Insufficient AI points');
  });

  test('应该正确处理权限验证失败', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockRejectedValue(new Error('Permission denied'));

    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Permission denied');
  });

  test('应该正确处理服务层错误', async () => {
    const serviceError = new Error('Report generation service unavailable');
    (EvaluationSummaryService.generateSummaryReports as any).mockRejectedValue(serviceError);

    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Report generation service unavailable');
  });

  test('应该正确处理缺少请求体的情况', async () => {
    const mockReq = {
      method: 'POST',
      body: null
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该正确处理空的请求体', async () => {
    const mockReq = {
      method: 'POST',
      body: {}
    } as any;

    await expect(handler(mockReq)).rejects.toBe(EvaluationErrEnum.evalIdRequired);
  });

  test('应该在权限验证后才检查 AI 点数', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    await handler(mockReq);

    // checkTeamAIPoints 应该在 authEvaluationTaskWrite 之后调用
    expect(checkTeamAIPoints).toHaveBeenCalledWith(expect.any(Types.ObjectId));
  });

  test('应该正确处理非字符串的指标ID', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: [123, 456, 'metric-3']
      }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.generateSummaryReports).toHaveBeenCalledWith(mockEvalId, [
      123,
      456,
      'metric-3'
    ]);
    expect(result).toEqual({
      success: true,
      message: 'Report generation task started'
    });
  });

  test('应该正确处理包含重复指标ID的数组', async () => {
    const duplicateMetricsIds = ['metric-1', 'metric-2', 'metric-1', 'metric-3'];
    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: duplicateMetricsIds
      }
    } as any;

    const result = await handler(mockReq);

    expect(EvaluationSummaryService.generateSummaryReports).toHaveBeenCalledWith(
      mockEvalId,
      duplicateMetricsIds
    );
    expect(result).toEqual({
      success: true,
      message: 'Report generation task started'
    });
  });

  test('应该正确记录日志信息', async () => {
    const { addLog } = await import('@fastgpt/service/common/system/log');

    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    await handler(mockReq);

    expect(addLog.info).toHaveBeenCalledWith(
      '[EvaluationSummary] Starting summary report generation',
      {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds,
        metricsCount: mockMetricsIds.length
      }
    );
  });

  test('应该正确处理异步生成过程中的错误', async () => {
    const asyncError = new Error('Async generation failed');
    (EvaluationSummaryService.generateSummaryReports as any).mockRejectedValue(asyncError);

    const mockReq = {
      method: 'POST',
      body: {
        evalId: mockEvalId,
        metricsIds: mockMetricsIds
      }
    } as any;

    await expect(handler(mockReq)).rejects.toThrow('Async generation failed');
  });
});
