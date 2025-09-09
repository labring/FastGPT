import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/task/item/delete';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    deleteEvaluationItem: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationItemWrite: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Delete Evaluation Item API Handler', () => {
  const mockRequest = (query: any) =>
    ({
      query,
      method: 'DELETE'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功删除评估项', async () => {
    const { authEvaluationItemWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      evaluationItem: { _id: 'item-123' },
      teamId: 'team-123',
      tmbId: 'tmb-123'
    });
    (EvaluationTaskService.deleteEvaluationItem as any).mockResolvedValue(undefined);

    const req = mockRequest({
      evalItemId: 'item-123'
    });

    const result = await handler(req);

    expect(authEvaluationItemWrite).toHaveBeenCalledWith('item-123', {
      req,
      authApiKey: true,
      authToken: true
    });
    expect(EvaluationTaskService.deleteEvaluationItem).toHaveBeenCalledWith('item-123', 'team-123');
    expect(result).toEqual({
      message: 'Evaluation item deleted successfully'
    });
  });

  test('缺少evalItemId时应该抛出错误', async () => {
    const req = mockRequest({});

    await expect(handler(req)).rejects.toThrow('evaluationItemIdRequired');
  });

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationItemWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemWrite as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      evalItemId: 'item-123'
    });

    await expect(handler(req)).rejects.toThrow('Permission denied');
  });

  test('删除服务失败时应该抛出错误', async () => {
    const { authEvaluationItemWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      evaluationItem: { _id: 'item-123' },
      teamId: 'team-123',
      tmbId: 'tmb-123'
    });
    (EvaluationTaskService.deleteEvaluationItem as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const req = mockRequest({
      evalItemId: 'item-123'
    });

    await expect(handler(req)).rejects.toThrow('Database connection failed');
  });
});
