import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { handler } from '@/pages/api/core/evaluation/task/dataItem/export';

// Mock NextAPI wrapper
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    exportEvaluationResultsGroupedByDataItem: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn()
}));

describe('Export DataItem Grouped Results API Handler', () => {
  const mockRequest = (body: any) =>
    ({
      body,
      method: 'POST'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功导出JSON格式的数据项分组结果', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockExportResult = {
      results: Buffer.from(
        JSON.stringify([
          {
            dataItemId: 'data-item-123',
            userInput: 'Test question',
            expectedOutput: 'Test answer',
            actualOutput: 'Generated response',
            metricScores: { 'Test Metric': 85 }
          }
        ])
      ),
      totalItems: 1
    };

    (EvaluationTaskService.exportEvaluationResultsGroupedByDataItem as any).mockResolvedValue(
      mockExportResult
    );

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'json'
    });

    const result = await handler(req);

    expect(EvaluationTaskService.exportEvaluationResultsGroupedByDataItem).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      'eval-123',
      'json'
    );
    expect(result).toEqual({
      results: mockExportResult.results,
      fileName: 'evaluation_eval-123_dataItems.json',
      contentType: 'application/json'
    });
  });

  test('应该成功导出CSV格式的数据项分组结果', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockExportResult = {
      results: Buffer.from(
        'DataItemId,UserInput,ExpectedOutput,ActualOutput,Test Metric\ndata-item-123,Test question,Test answer,Generated response,85'
      ),
      totalItems: 1
    };

    (EvaluationTaskService.exportEvaluationResultsGroupedByDataItem as any).mockResolvedValue(
      mockExportResult
    );

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'csv'
    });

    const result = await handler(req);

    expect(EvaluationTaskService.exportEvaluationResultsGroupedByDataItem).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      'eval-123',
      'csv'
    );
    expect(result).toEqual({
      results: mockExportResult.results,
      fileName: 'evaluation_eval-123_dataItems.csv',
      contentType: 'text/csv'
    });
  });

  test('默认格式应该是JSON', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockExportResult = {
      results: Buffer.from('[]'),
      totalItems: 0
    };

    (EvaluationTaskService.exportEvaluationResultsGroupedByDataItem as any).mockResolvedValue(
      mockExportResult
    );

    const req = mockRequest({
      evalId: 'eval-123'
      // No format specified
    });
    await handler(req);

    expect(EvaluationTaskService.exportEvaluationResultsGroupedByDataItem).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      'eval-123',
      'json'
    );
  });

  test('空数据时应该正常导出', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockExportResult = {
      results: Buffer.from('[]'),
      totalItems: 0
    };

    (EvaluationTaskService.exportEvaluationResultsGroupedByDataItem as any).mockResolvedValue(
      mockExportResult
    );

    const req = mockRequest({
      evalId: 'empty-eval-123',
      format: 'json'
    });

    const result = await handler(req);

    expect(result).toEqual({
      results: mockExportResult.results,
      fileName: 'evaluation_empty-eval-123_dataItems.json',
      contentType: 'application/json'
    });
  });

  test('缺少evalId时应该抛出错误', async () => {
    const req = mockRequest({
      format: 'json'
    });

    await expect(() => handler(req)).rejects.toThrow('evaluationIdRequired');
  });

  test('无效格式时应该抛出错误', async () => {
    const req = mockRequest({
      evalId: 'eval-123',
      format: 'invalid'
    });

    await expect(() => handler(req)).rejects.toThrow('evaluationInvalidFormat');
  });

  test('评估任务不存在时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockRejectedValue(new Error('evaluationTaskNotFound'));

    const req = mockRequest({
      evalId: 'invalid-eval-id',
      format: 'json'
    });

    await expect(() => handler(req)).rejects.toThrow('evaluationTaskNotFound');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });
    (EvaluationTaskService.exportEvaluationResultsGroupedByDataItem as any).mockRejectedValue(
      new Error('Export failed')
    );

    const req = mockRequest({
      evalId: 'eval-123',
      format: 'json'
    });

    await expect(() => handler(req)).rejects.toThrow('Export failed');
  });
});
