import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as listHandler } from '@/pages/api/core/evaluation/task/list';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    listEvaluations: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  getEvaluationPermissionAggregation: vi.fn().mockResolvedValue({
    teamId: 'mock-team-id',
    tmbId: 'mock-tmb-id',
    isOwner: true,
    roleList: [],
    myGroupMap: new Map(),
    myOrgSet: new Set()
  })
}));

// Mock additional modules for permission handling
vi.mock('@fastgpt/global/support/permission/evaluation/controller', () => ({
  EvaluationPermission: vi.fn().mockImplementation(() => ({
    hasReadPer: true
  }))
}));

vi.mock('@fastgpt/service/support/user/utils', () => ({
  addSourceMember: vi.fn().mockImplementation(({ list }) => Promise.resolve(list))
}));

describe('List Evaluation Tasks API Handler', () => {
  const mockEvaluation = {
    _id: new Types.ObjectId(),
    name: 'Test Evaluation',
    description: 'Test Description',
    datasetId: new Types.ObjectId(),
    targetId: new Types.ObjectId(),
    metricIds: [new Types.ObjectId(), new Types.ObjectId()],
    usageId: new Types.ObjectId(),
    status: EvaluationStatusEnum.queuing,
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    createTime: new Date(),
    updateTime: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('应该成功获取评估任务列表', async () => {
    const mockReq = {
      body: {
        pageNum: 1,
        pageSize: 10
      }
    } as any;

    const mockResult = {
      list: [mockEvaluation],
      total: 1
    };

    (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

    const result = await listHandler(mockReq);

    expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
      'mock-team-id',
      0,
      10,
      undefined,
      [],
      'mock-tmb-id',
      true,
      undefined,
      undefined
    );
    expect(result).toEqual({
      list: mockResult.list.map((item) => ({
        ...item,
        permission: { hasReadPer: true },
        private: true
      })),
      total: mockResult.total
    });
  });

  test('应该处理搜索参数', async () => {
    const mockReq = {
      body: {
        pageNum: 2,
        pageSize: 20,
        searchKey: 'test search'
      }
    } as any;

    const mockResult = { list: [], total: 0 };
    (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

    await listHandler(mockReq);

    expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
      'mock-team-id',
      20,
      20,
      'test search',
      [],
      'mock-tmb-id',
      true,
      undefined,
      undefined
    );
  });

  test('应该使用默认分页参数', async () => {
    const mockReq = {
      body: {},
      query: {}
    } as any;

    const mockResult = { list: [], total: 0 };
    (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

    await listHandler(mockReq);

    expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
      'mock-team-id',
      0,
      10,
      undefined,
      [],
      'mock-tmb-id',
      true,
      undefined,
      undefined
    );
  });

  test('应该处理target过滤参数', async () => {
    const mockReq = {
      body: {
        pageNum: 1,
        pageSize: 10,
        appName: 'Test App',
        appId: '507f1f77bcf86cd799439011',
        versionId: '507f1f77bcf86cd799439012'
      }
    } as any;

    const mockResult = { list: [], total: 0 };
    (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

    await listHandler(mockReq);

    expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
      'mock-team-id',
      0,
      10,
      undefined,
      [],
      'mock-tmb-id',
      true,
      'Test App',
      '507f1f77bcf86cd799439011'
    );
  });

  test('应该处理部分target过滤参数', async () => {
    const mockReq = {
      body: {
        pageNum: 1,
        pageSize: 10,
        appName: 'Partial App'
      }
    } as any;

    const mockResult = { list: [], total: 0 };
    (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

    await listHandler(mockReq);

    expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
      'mock-team-id',
      0,
      10,
      undefined,
      [],
      'mock-tmb-id',
      true,
      'Partial App',
      undefined
    );
  });

  test('应该处理包含空白字符的target过滤参数', async () => {
    const mockReq = {
      body: {
        pageNum: 1,
        pageSize: 10,
        appName: '  Test App  ',
        appId: '  507f1f77bcf86cd799439011  ',
        versionId: '  507f1f77bcf86cd799439012  '
      }
    } as any;

    const mockResult = { list: [], total: 0 };
    (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

    await listHandler(mockReq);

    expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
      'mock-team-id',
      0,
      10,
      undefined,
      [],
      'mock-tmb-id',
      true,
      'Test App',
      '507f1f77bcf86cd799439011'
    );
  });
});
