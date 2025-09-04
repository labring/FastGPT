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
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id'
  })
}));

describe('Delete Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功删除评估任务', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'DELETE',
      query: { evalId: evalId }
    } as any;

    (EvaluationTaskService.deleteEvaluation as any).mockResolvedValue(undefined);

    const result = await deleteHandler(mockReq);

    expect(EvaluationTaskService.deleteEvaluation).toHaveBeenCalledWith(evalId, 'mock-team-id');
    expect(result).toEqual({ message: 'Evaluation deleted successfully' });
  });
});
