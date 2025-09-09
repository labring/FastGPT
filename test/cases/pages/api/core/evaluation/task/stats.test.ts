import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as statsHandler } from '@/pages/api/core/evaluation/task/stats';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    getEvaluationStats: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id'
  })
}));

describe('Get Evaluation Task Stats API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取评估任务统计信息', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'GET',
      query: { evalId }
    } as any;

    const mockStats = {
      total: 100,
      completed: 80,
      evaluating: 10,
      queuing: 5,
      error: 5,
      avgScore: 85.5
    };

    (EvaluationTaskService.getEvaluationStats as any).mockResolvedValue(mockStats);

    const result = await statsHandler(mockReq);

    expect(EvaluationTaskService.getEvaluationStats).toHaveBeenCalledWith(evalId, 'mock-team-id');
    expect(result).toEqual(mockStats);
  });

  test('应该拒绝缺少评估ID的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: {}
    } as any;

    await expect(statsHandler(mockReq)).rejects.toThrow('evaluationIdRequired');
  });
});
