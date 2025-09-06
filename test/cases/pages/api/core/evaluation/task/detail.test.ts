import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as detailHandler } from '@/pages/api/core/evaluation/task/detail';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    getEvaluation: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id',
    evaluation: {
      _id: 'mock-eval-id',
      name: 'Mock Evaluation',
      status: 'completed'
    }
  })
}));

describe('Get Evaluation Task Detail API Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取评估任务详情', async () => {
    const evalId = new Types.ObjectId().toString();
    const mockReq = {
      method: 'GET',
      query: { evalId: evalId }
    } as any;

    const result = await detailHandler(mockReq);

    // The detail handler no longer calls getEvaluation, it gets data from authEvaluationTaskRead
    expect(result).toEqual(
      expect.objectContaining({
        _id: 'mock-eval-id',
        name: 'Mock Evaluation',
        status: 'completed'
      })
    );
  });

  test('应该拒绝缺少ID的请求', async () => {
    const mockReq = {
      method: 'GET',
      query: {}
    } as any;

    await expect(detailHandler(mockReq)).rejects.toMatch('Evaluation ID is required');
  });
});
