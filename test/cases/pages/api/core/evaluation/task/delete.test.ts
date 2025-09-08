import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as deleteHandler } from '@/pages/api/core/evaluation/task/delete';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    deleteEvaluation: vi.fn()
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

describe('Delete Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功删除评估任务', async () => {
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
      method: 'DELETE',
      query: { evalId: evalId }
    } as any;

    (EvaluationTaskService.deleteEvaluation as any).mockResolvedValue(undefined);

    const result = await deleteHandler(mockReq);

    expect(EvaluationTaskService.deleteEvaluation).toHaveBeenCalledWith(evalId, mockTeamId);
    expect(result).toEqual({ message: 'Evaluation deleted successfully' });
  });
});
