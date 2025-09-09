import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { handler } from '@/pages/api/core/evaluation/task/dataItem/retry';

// Mock NextAPI wrapper
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    retryEvaluationItemsByDataItem: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskWrite: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Retry DataItem API Handler', () => {
  const mockRequest = (body: any) =>
    ({
      body,
      method: 'POST'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功重试数据项的失败评估', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockRetryResult = {
      retriedCount: 2
    };
    (EvaluationTaskService.retryEvaluationItemsByDataItem as any).mockResolvedValue(
      mockRetryResult
    );

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123'
    });

    const result = await handler(req);

    expect(EvaluationTaskService.retryEvaluationItemsByDataItem).toHaveBeenCalledWith(
      'data-item-123',
      '507f1f77bcf86cd799439011',
      'eval-123'
    );
    expect(result).toEqual({
      message: 'Successfully retried 2 evaluation items',
      retriedCount: 2
    });
  });

  test('没有失败项目时应该返回retriedCount为0', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockRetryResult = {
      retriedCount: 0
    };
    (EvaluationTaskService.retryEvaluationItemsByDataItem as any).mockResolvedValue(
      mockRetryResult
    );

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123'
    });

    const result = await handler(req);

    expect(result).toEqual({
      message: 'Successfully retried 0 evaluation items',
      retriedCount: 0
    });
  });

  test('缺少dataItemId时应该抛出错误', async () => {
    const req = mockRequest({
      evalId: 'eval-123'
    });

    await expect(handler(req)).rejects.toThrow('evaluationDataItemIdRequired');
  });

  test('缺少evalId时应该抛出错误', async () => {
    const req = mockRequest({
      dataItemId: 'data-item-123'
    });

    await expect(handler(req)).rejects.toThrow('evaluationIdRequired');
  });
});
