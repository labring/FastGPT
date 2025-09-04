import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as stopHandler } from '@/pages/api/core/evaluation/task/stop';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    stopEvaluation: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskExecution: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id'
  })
}));

describe('Stop Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功停止评估任务', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'POST',
      body: { evalId }
    } as any;

    (EvaluationTaskService.stopEvaluation as any).mockResolvedValue(undefined);

    const result = await stopHandler(mockReq);

    expect(EvaluationTaskService.stopEvaluation).toHaveBeenCalledWith(evalId, 'mock-team-id');
    expect(result).toEqual({ message: 'Evaluation stopped successfully' });
  });
});
