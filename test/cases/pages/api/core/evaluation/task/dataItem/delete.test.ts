import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { handler } from '@/pages/api/core/evaluation/task/dataItem/delete';

// Mock NextAPI wrapper
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    deleteEvaluationItemsByDataItem: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskWrite: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Delete DataItem API Handler', () => {
  const mockRequest = (body: any) =>
    ({
      body,
      method: 'POST'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功删除数据项的所有评估项', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockDeleteResult = {
      deletedCount: 3
    };
    (EvaluationTaskService.deleteEvaluationItemsByDataItem as any).mockResolvedValue(
      mockDeleteResult
    );

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123'
    });

    const result = await handler(req);

    expect(authEvaluationTaskWrite).toHaveBeenCalledWith('eval-123', {
      req,
      authApiKey: true,
      authToken: true
    });
    expect(EvaluationTaskService.deleteEvaluationItemsByDataItem).toHaveBeenCalledWith(
      'data-item-123',
      '507f1f77bcf86cd799439011',
      'eval-123'
    );
    expect(result).toEqual({
      message: 'Successfully deleted 3 evaluation items',
      deletedCount: 3
    });
  });

  test('数据项不存在时应该返回deletedCount为0', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockDeleteResult = {
      deletedCount: 0
    };
    (EvaluationTaskService.deleteEvaluationItemsByDataItem as any).mockResolvedValue(
      mockDeleteResult
    );

    const req = mockRequest({
      dataItemId: 'non-existent-data-item',
      evalId: 'eval-123'
    });

    const result = await handler(req);

    expect(result).toEqual({
      message: 'Successfully deleted 0 evaluation items',
      deletedCount: 0
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

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123'
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
    (EvaluationTaskService.deleteEvaluationItemsByDataItem as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const req = mockRequest({
      dataItemId: 'data-item-123',
      evalId: 'eval-123'
    });

    await expect(handler(req)).rejects.toThrow('Database connection failed');
  });
});
