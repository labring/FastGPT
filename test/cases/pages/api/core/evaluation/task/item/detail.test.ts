import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler } from '@/pages/api/core/evaluation/task/item/detail';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    getEvaluationItemResult: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationItemRead: vi.fn()
}));

describe('Get Evaluation Item Detail API Handler', () => {
  const mockItemResult = {
    item: {
      _id: new Types.ObjectId(),
      evalId: new Types.ObjectId(),
      dataItem: {
        userInput: 'Test question',
        expectedOutput: 'Test answer'
      },
      target: {
        type: 'workflow',
        config: { appId: 'test-app' }
      },
      evaluator: {
        metric: { name: 'Test Metric' }
      },
      status: EvaluationStatusEnum.completed
    },
    dataItem: {
      userInput: 'Test question',
      expectedOutput: 'Test answer'
    },
    response: 'Generated response',
    result: {
      metricName: 'Test Metric',
      data: {
        score: 85,
        runLogs: { test: true }
      }
    },
    score: 85
  };

  const mockRequest = (query: any) =>
    ({
      query,
      method: 'GET'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取评估项详情', async () => {
    const { authEvaluationItemRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemRead as any).mockResolvedValue({
      teamId: 'team-123'
    });
    (EvaluationTaskService.getEvaluationItemResult as any).mockResolvedValue(mockItemResult);

    const req = mockRequest({
      evalItemId: 'item-123'
    });

    const result = await handler(req);

    expect(authEvaluationItemRead).toHaveBeenCalledWith('item-123', {
      req,
      authApiKey: true,
      authToken: true
    });
    expect(EvaluationTaskService.getEvaluationItemResult).toHaveBeenCalledWith(
      'item-123',
      'team-123'
    );
    expect(result).toEqual(mockItemResult);
  });

  test('缺少evalItemId时应该抛出错误', async () => {
    const req = mockRequest({});

    await expect(handler(req)).rejects.toThrow('evaluationItemIdRequired');
  });

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationItemRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemRead as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      evalItemId: 'item-123'
    });

    await expect(handler(req)).rejects.toThrow('Permission denied');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationItemRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationItemRead as any).mockResolvedValue({
      teamId: 'team-123'
    });
    (EvaluationTaskService.getEvaluationItemResult as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const req = mockRequest({
      evalItemId: 'item-123'
    });

    await expect(handler(req)).rejects.toThrow('Database connection failed');
  });
});
