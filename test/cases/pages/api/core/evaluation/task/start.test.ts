import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as startHandler } from '@/pages/api/core/evaluation/task/start';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    startEvaluation: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskExecution: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id'
  })
}));

describe('Start Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功启动评估任务', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'POST',
      body: { evalId }
    } as any;

    (EvaluationTaskService.startEvaluation as any).mockResolvedValue(undefined);

    const result = await startHandler(mockReq);

    expect(EvaluationTaskService.startEvaluation).toHaveBeenCalledWith(evalId, 'mock-team-id');
    expect(result).toEqual({ message: 'Evaluation started successfully' });
  });

  test('应该拒绝缺少评估ID的请求', async () => {
    const mockReq = {
      method: 'POST',
      body: {}
    } as any;

    await expect(startHandler(mockReq)).rejects.toMatch('Evaluation ID is required');
  });
});
