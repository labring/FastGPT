import { describe, test, expect, vi, beforeEach } from 'vitest';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { handler } from '@/pages/api/core/evaluation/task/dataItem/update';

// Mock NextAPI wrapper
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    updateEvaluationItemsByDataItem: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskWrite: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Update DataItem API Handler', () => {
  const mockRequest = (body: any) =>
    ({
      body,
      method: 'POST'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功更新数据项的评估内容', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockUpdateResult = {
      updatedCount: 2
    };
    (EvaluationTaskService.updateEvaluationItemsByDataItem as any).mockResolvedValue(
      mockUpdateResult
    );

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123',
      userInput: 'Updated question',
      expectedOutput: 'Updated answer'
    });
    const result = await handler(req);

    expect(authEvaluationTaskWrite).toHaveBeenCalledWith('eval-123', {
      req,
      authApiKey: true,
      authToken: true
    });
    expect(EvaluationTaskService.updateEvaluationItemsByDataItem).toHaveBeenCalledWith(
      'data-item-123',
      {
        userInput: 'Updated question',
        expectedOutput: 'Updated answer',
        context: undefined,
        targetCallParams: undefined
      },
      '507f1f77bcf86cd799439011',
      'eval-123'
    );
    expect(result).toEqual({
      message: 'Successfully updated 2 evaluation items',
      updatedCount: 2
    });
  });

  test('缺少dataItemId时应该抛出错误', async () => {
    const req = mockRequest({
      evalId: 'eval-123',
      userInput: 'Updated question'
    });

    await expect(handler(req)).rejects.toThrow('evaluationDataItemIdRequired');
  });

  test('缺少evalId时应该抛出错误', async () => {
    const req = mockRequest({
      dataItemId: 'data-item-123',
      userInput: 'Updated question'
    });

    await expect(handler(req)).rejects.toThrow('evaluationIdRequired');
  });

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123',
      userInput: 'Updated question'
    });

    await expect(handler(req)).rejects.toThrow('Permission denied');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });
    (EvaluationTaskService.updateEvaluationItemsByDataItem as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123',
      userInput: 'Updated question'
    });

    await expect(handler(req)).rejects.toThrow('Database connection failed');
  });
});
