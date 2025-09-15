import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { handler } from '@/pages/api/core/evaluation/task/dataItem/list';

// Mock NextAPI wrapper
vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    listDataItemsGrouped: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskRead: vi.fn()
}));

describe('List DataItems Grouped API Handler', () => {
  const mockDataItemGrouped = {
    dataItemId: 'data-item-123',
    dataItem: {
      userInput: 'Test question',
      expectedOutput: 'Test answer'
    },
    items: [
      {
        _id: new Types.ObjectId(),
        evalId: new Types.ObjectId(),
        status: EvaluationStatusEnum.completed,
        evaluatorOutput: { data: { score: 85 } }
      }
    ],
    statistics: {
      totalItems: 2,
      completedItems: 1,
      errorItems: 0
    }
  };

  const mockRequest = (body: any) =>
    ({
      body,
      method: 'POST'
    }) as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取分组的数据项列表', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockResult = {
      list: [mockDataItemGrouped],
      total: 1
    };

    (EvaluationTaskService.listDataItemsGrouped as any).mockResolvedValue(mockResult);

    const req = mockRequest({
      evalId: 'eval-123',
      pageNum: 1,
      pageSize: 20
    });

    const result = await handler(req);

    expect(EvaluationTaskService.listDataItemsGrouped).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      {
        evalId: 'eval-123',
        keyword: undefined,
        status: undefined,
        offset: 0,
        pageSize: 20
      }
    );
    expect(result).toEqual(mockResult);
  });

  test('应该支持状态过滤', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockResult = {
      list: [mockDataItemGrouped],
      total: 1
    };

    (EvaluationTaskService.listDataItemsGrouped as any).mockResolvedValue(mockResult);

    const req = mockRequest({
      evalId: 'eval-123',
      status: EvaluationStatusEnum.completed,
      pageNum: 1,
      pageSize: 20
    });

    await handler(req);

    expect(EvaluationTaskService.listDataItemsGrouped).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      {
        evalId: 'eval-123',
        keyword: undefined,
        status: EvaluationStatusEnum.completed,
        offset: 0,
        pageSize: 20
      }
    );
  });

  test('应该支持关键词搜索', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockResult = {
      list: [mockDataItemGrouped],
      total: 1
    };

    (EvaluationTaskService.listDataItemsGrouped as any).mockResolvedValue(mockResult);

    const req = mockRequest({
      evalId: 'eval-123',
      keyword: 'test',
      pageNum: 1,
      pageSize: 20
    });

    await handler(req);

    expect(EvaluationTaskService.listDataItemsGrouped).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      {
        evalId: 'eval-123',
        keyword: 'test',
        status: undefined,
        offset: 0,
        pageSize: 20
      }
    );
  });

  test('应该处理分页参数', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });

    const mockResult = {
      list: [mockDataItemGrouped],
      total: 50
    };

    (EvaluationTaskService.listDataItemsGrouped as any).mockResolvedValue(mockResult);

    const req = mockRequest({
      evalId: 'eval-123',
      pageNum: 3,
      pageSize: 10
    });

    await handler(req);

    expect(EvaluationTaskService.listDataItemsGrouped).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      {
        evalId: 'eval-123',
        keyword: undefined,
        status: undefined,
        offset: 20, // (pageNum - 1) * pageSize = (3 - 1) * 10
        pageSize: 10
      }
    );
  });

  test('缺少evalId时应该抛出错误', async () => {
    const req = mockRequest({
      current: 1,
      pageSize: 20
    });

    await expect(handler(req)).rejects.toThrow('evaluationIdRequired');
  });

  test('服务层异常时应该抛出错误', async () => {
    const { authEvaluationTaskRead } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskRead as any).mockResolvedValue({
      evaluation: { name: 'Test Evaluation' },
      teamId: '507f1f77bcf86cd799439011',
      tmbId: '507f1f77bcf86cd799439012'
    });
    (EvaluationTaskService.listDataItemsGrouped as any).mockRejectedValue(
      new Error('Database error')
    );

    const req = mockRequest({
      evalId: 'eval-123',
      current: 1,
      pageSize: 20
    });

    await expect(handler(req)).rejects.toThrow('Database error');
  });
});
