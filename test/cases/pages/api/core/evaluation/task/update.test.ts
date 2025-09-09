import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as updateHandler } from '@/pages/api/core/evaluation/task/update';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    updateEvaluation: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskWrite: vi.fn().mockResolvedValue({
    evaluation: { name: 'Test Evaluation Task' },
    teamId: new Types.ObjectId().toString(),
    tmbId: new Types.ObjectId().toString()
  })
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/evaluation/utils', () => ({
  validateEvaluationParamsForUpdate: vi.fn().mockResolvedValue({ success: true })
}));

describe('Update Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功更新评估任务', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockTeamId = new Types.ObjectId().toString();

    // Update mock to return consistent teamId
    const { authEvaluationTaskWrite } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskWrite as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation Task' },
      teamId: mockTeamId,
      tmbId: new Types.ObjectId().toString()
    });

    const mockReq = {
      method: 'PUT',
      body: {
        evalId: evalId,
        name: 'Updated Evaluation',
        description: 'Updated Description'
      }
    } as any;

    (EvaluationTaskService.updateEvaluation as any).mockResolvedValue(false);

    const result = await updateHandler(mockReq);

    expect(EvaluationTaskService.updateEvaluation).toHaveBeenCalledWith(
      evalId,
      expect.objectContaining({
        name: 'Updated Evaluation',
        description: 'Updated Description'
      }),
      mockTeamId
    );
    expect(result).toEqual({
      message: 'Evaluation updated successfully'
    });
  });

  test('缺少评估ID时应该抛出错误', async () => {
    const mockReq = {
      method: 'PUT',
      body: {
        name: 'Updated Evaluation'
      }
    } as any;

    await expect(updateHandler(mockReq)).rejects.toThrow('evaluationIdRequired');
  });

  test('验证失败时应该抛出错误', async () => {
    const { validateEvaluationParamsForUpdate } = await import(
      '@fastgpt/service/core/evaluation/utils'
    );
    (validateEvaluationParamsForUpdate as any).mockResolvedValue({
      success: false,
      message: 'Invalid parameters'
    });

    const mockReq = {
      method: 'PUT',
      body: {
        evalId: new Types.ObjectId().toString(),
        name: ''
      }
    } as any;

    await expect(updateHandler(mockReq)).rejects.toThrow('Invalid parameters');
  });
});
