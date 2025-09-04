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
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id'
  })
}));

describe('Update Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功更新评估任务', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'PUT',
      body: {
        evalId: evalId,
        name: 'Updated Evaluation',
        description: 'Updated Description'
      }
    } as any;

    (EvaluationTaskService.updateEvaluation as any).mockResolvedValue(undefined);

    const result = await updateHandler(mockReq);

    expect(EvaluationTaskService.updateEvaluation).toHaveBeenCalledWith(
      evalId,
      expect.objectContaining({
        name: 'Updated Evaluation',
        description: 'Updated Description'
      }),
      'mock-team-id'
    );
    expect(result).toEqual({ message: 'Evaluation updated successfully' });
  });
});
