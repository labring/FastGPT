import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { handler } from '@/pages/api/core/evaluation/task/item/list';

// Mock NextAPI wrapper
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    listEvaluationItems: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn()
}));

describe('List Evaluation Items API Handler', () => {
  const mockItems = [
    {
      _id: new Types.ObjectId(),
      evalId: new Types.ObjectId(),
      status: EvaluationStatusEnum.completed,
      score: 85,
      dataItem: {
        userInput: 'Test question',
        expectedOutput: 'Test answer'
      }
    },
    {
      _id: new Types.ObjectId(),
      evalId: new Types.ObjectId(),
      status: EvaluationStatusEnum.error,
      score: null,
      dataItem: {
        userInput: 'Failed question',
        expectedOutput: 'Failed answer'
      }
    }
  ];

  const mockRequest = (body: any) =>
    ({
      body: {
        ...body,
        pageSize: 20,
        pageNum: 1
      },
      method: 'POST'
    }) as any;

  const mockResponse = () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    return res as any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取评估项列表', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123'
    });
    (EvaluationTaskService.listEvaluationItems as any).mockResolvedValue({
      items: mockItems,
      total: 2
    });

    const req = mockRequest({
      evalId: 'eval-123'
    });

    const result = await handler(req);

    expect(authEvaluationTaskRead).toHaveBeenCalledWith('eval-123', {
      req,
      authApiKey: true,
      authToken: true
    });
    expect(EvaluationTaskService.listEvaluationItems).toHaveBeenCalledWith(
      'eval-123',
      'team-123',
      0,
      20,
      {
        status: undefined,
        belowThreshold: undefined,
        userInput: undefined,
        expectedOutput: undefined,
        actualOutput: undefined
      }
    );
    expect(result).toEqual({
      list: mockItems,
      total: 2
    });
  });

  test('缺少evalId时应该抛出错误', async () => {
    const req = mockRequest({});

    await expect(handler(req)).rejects.toThrow('evaluationIdRequired');
  });

  test('认证失败时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockRejectedValue(new Error('Permission denied'));

    const req = mockRequest({
      evalId: 'eval-123'
    });

    await expect(handler(req)).rejects.toThrow('Permission denied');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123'
    });
    (EvaluationTaskService.listEvaluationItems as any).mockRejectedValue(
      new Error('Database connection failed')
    );

    const req = mockRequest({
      evalId: 'eval-123'
    });

    await expect(handler(req)).rejects.toThrow('Database connection failed');
  });

  test('应该支持belowThreshold筛选', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      teamId: 'team-123'
    });
    (EvaluationTaskService.listEvaluationItems as any).mockResolvedValue({
      items: [],
      total: 0
    });

    const req = mockRequest({
      evalId: 'eval-123',
      belowThreshold: true
    });

    const result = await handler(req);

    expect(EvaluationTaskService.listEvaluationItems).toHaveBeenCalledWith(
      'eval-123',
      'team-123',
      0,
      20,
      {
        status: undefined,
        belowThreshold: true,
        userInput: undefined,
        expectedOutput: undefined,
        actualOutput: undefined
      }
    );
    expect(result).toEqual({
      list: [],
      total: 0
    });
  });
});
