import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/task/item/update';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    updateEvaluationItem: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationItemWrite: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn()
}));

describe('Update Evaluation Item API Handler', () => {
  const mockRequest = (body: any) =>
    ({
      body,
      method: 'POST'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功更新评估项', async () => {
    const { authEvaluationItemWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      evaluationItem: { _id: 'item-123' },
      teamId: 'team-123',
      tmbId: 'tmb-123'
    });
    (EvaluationTaskService.updateEvaluationItem as any).mockResolvedValue(undefined);

    const req = mockRequest({
      evalItemId: 'item-123',
      userInput: 'Updated question',
      expectedOutput: 'Updated answer'
    });

    const result = await handler(req);

    expect(EvaluationTaskService.updateEvaluationItem).toHaveBeenCalledWith(
      'item-123',
      {
        userInput: 'Updated question',
        expectedOutput: 'Updated answer',
        context: undefined,
        targetCallParams: undefined
      },
      'team-123'
    );
    expect(result).toEqual({
      message: 'Evaluation item updated successfully'
    });
  });

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationItemWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemWrite as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      evalItemId: 'item-123',
      userInput: 'Updated question',
      expectedOutput: 'Updated answer'
    });

    await expect(handler(req)).rejects.toThrow('Permission denied');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationItemWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      evaluationItem: { _id: 'item-123' },
      teamId: 'team-123',
      tmbId: 'tmb-123'
    });
    (EvaluationTaskService.updateEvaluationItem as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const req = mockRequest({
      evalItemId: 'item-123',
      userInput: 'Updated question',
      expectedOutput: 'Updated answer'
    });

    await expect(handler(req)).rejects.toThrow('Database connection failed');
  });
});
