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
    evaluation: { name: 'Test Evaluation Task' },
    teamId: new Types.ObjectId().toString(),
    tmbId: new Types.ObjectId().toString()
  })
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn().mockResolvedValue(undefined)
}));

describe('Start Evaluation Task API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功启动评估任务', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockTeamId = new Types.ObjectId().toString();

    // Update mock to return consistent teamId
    const { authEvaluationTaskExecution } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskExecution as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation Task' },
      teamId: mockTeamId,
      tmbId: new Types.ObjectId().toString()
    });

    const mockReq = {
      method: 'POST',
      body: { evalId }
    } as any;

    (EvaluationTaskService.startEvaluation as any).mockResolvedValue(undefined);

    const result = await startHandler(mockReq);

    expect(EvaluationTaskService.startEvaluation).toHaveBeenCalledWith(evalId, mockTeamId);
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
