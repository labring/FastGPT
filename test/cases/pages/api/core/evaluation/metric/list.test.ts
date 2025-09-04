import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/list';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';
import type { ListMetricsBody } from '@fastgpt/global/core/evaluation/metric/api';
import { Types } from '@fastgpt/service/common/mongo';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    find: vi.fn(() => ({
      sort: vi.fn(() => ({
        skip: vi.fn(() => ({
          limit: vi.fn(() => ({
            lean: vi.fn()
          }))
        }))
      }))
    })),
    countDocuments: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/utils', () => ({
  addSourceMember: vi.fn()
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  getEvaluationPermissionAggregation: vi.fn()
}));

describe('/api/core/evaluation/metric/list', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockUserId = 'user123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list metrics successfully without search', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock permission aggregation response
    vi.mocked(getEvaluationPermissionAggregation).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isOwner: false,
      roleList: [],
      myGroupMap: new Map(),
      myOrgSet: new Set()
    });

    // Mock database response
    const mockMetrics = [
      {
        _id: 'metric1',
        name: 'Metric 1',
        description: 'Description 1',
        createTime: new Date('2024-01-01'),
        updateTime: new Date('2024-01-01'),
        tmbId: mockTmbId,
        permission: { hasReadPer: true }
      },
      {
        _id: 'metric2',
        name: 'Metric 2',
        description: 'Description 2',
        createTime: new Date('2024-01-02'),
        updateTime: new Date('2024-01-02'),
        tmbId: mockTmbId,
        permission: { hasReadPer: true }
      }
    ];

    const mockMetricsWithSource = [
      {
        _id: 'metric1',
        name: 'Metric 1',
        description: 'Description 1',
        createTime: new Date('2024-01-01'),
        updateTime: new Date('2024-01-01'),
        tmbId: mockTmbId,
        sourceMember: { name: 'User 1', avatar: 'avatar1.png', status: 'active' as any }
      },
      {
        _id: 'metric2',
        name: 'Metric 2',
        description: 'Description 2',
        createTime: new Date('2024-01-02'),
        updateTime: new Date('2024-01-02'),
        tmbId: mockTmbId,
        sourceMember: { name: 'User 2', avatar: 'avatar2.png', status: 'active' as any }
      }
    ];

    const mockQuery = {
      lean: vi.fn().mockResolvedValue(mockMetrics)
    };
    const mockSkip = {
      limit: vi.fn().mockReturnValue(mockQuery)
    };
    const mockSort = {
      skip: vi.fn().mockReturnValue(mockSkip)
    };
    const mockFind = {
      sort: vi.fn().mockReturnValue(mockSort)
    };

    vi.mocked(MongoEvalMetric.find).mockReturnValue(mockFind as any);
    vi.mocked(MongoEvalMetric.countDocuments).mockResolvedValue(2);
    vi.mocked(addSourceMember).mockResolvedValue(mockMetricsWithSource);

    const req = {
      body: {
        pageNum: 1,
        pageSize: 10
      } as ListMetricsBody,
      auth: {
        userId: mockUserId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    const result = await handler(req as any);

    // Verify auth was called
    expect(authUserPer).toHaveBeenCalledWith({
      req,
      authToken: true,
      authApiKey: true,
      per: expect.any(Number)
    });

    // Verify permission aggregation was called
    expect(getEvaluationPermissionAggregation).toHaveBeenCalledWith({
      req,
      authApiKey: true,
      authToken: true
    });

    // Verify database query with expected filter structure
    expect(MongoEvalMetric.find).toHaveBeenCalledWith({
      $or: [
        {
          _id: {
            $in: []
          }
        },
        {
          tmbId: new Types.ObjectId(mockTmbId)
        }
      ],
      teamId: new Types.ObjectId(mockTeamId)
    });
    expect(mockFind.sort).toHaveBeenCalledWith({ createTime: -1 });
    expect(mockSort.skip).toHaveBeenCalledWith(0);
    expect(mockSkip.limit).toHaveBeenCalledWith(10);

    // Verify count query
    expect(MongoEvalMetric.countDocuments).toHaveBeenCalledWith({
      $or: [
        {
          _id: {
            $in: []
          }
        },
        {
          tmbId: new Types.ObjectId(mockTmbId)
        }
      ],
      teamId: new Types.ObjectId(mockTeamId)
    });

    // Verify source member addition (with permission objects added)
    expect(addSourceMember).toHaveBeenCalledWith({
      list: expect.arrayContaining([
        expect.objectContaining({
          _id: 'metric1',
          name: 'Metric 1',
          description: 'Description 1',
          createTime: new Date('2024-01-01'),
          updateTime: new Date('2024-01-01'),
          tmbId: mockTmbId,
          permission: expect.any(Object),
          private: expect.any(Boolean)
        }),
        expect.objectContaining({
          _id: 'metric2',
          name: 'Metric 2',
          description: 'Description 2',
          createTime: new Date('2024-01-02'),
          updateTime: new Date('2024-01-02'),
          tmbId: mockTmbId,
          permission: expect.any(Object),
          private: expect.any(Boolean)
        })
      ])
    });

    // Verify response
    expect(result).toEqual({
      total: 2,
      list: mockMetricsWithSource
    });
  });

  it('should list metrics with search key filter', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock database response
    const mockMetrics = [
      {
        _id: 'metric1',
        name: 'Test Metric',
        description: 'Test Description',
        createTime: new Date('2024-01-01'),
        updateTime: new Date('2024-01-01'),
        tmbId: mockTmbId
      }
    ];

    const mockQuery = {
      lean: vi.fn().mockResolvedValue(mockMetrics)
    };
    const mockSkip = {
      limit: vi.fn().mockReturnValue(mockQuery)
    };
    const mockSort = {
      skip: vi.fn().mockReturnValue(mockSkip)
    };
    const mockFind = {
      sort: vi.fn().mockReturnValue(mockSort)
    };

    vi.mocked(MongoEvalMetric.find).mockReturnValue(mockFind as any);
    vi.mocked(MongoEvalMetric.countDocuments).mockResolvedValue(1);
    vi.mocked(addSourceMember).mockResolvedValue(
      mockMetrics.map((item) => ({
        ...item,
        sourceMember: { name: 'User', avatar: 'avatar.png', status: 'active' as any }
      }))
    );

    const req = {
      body: {
        pageNum: 1,
        pageSize: 10,
        searchKey: 'Test'
      } as ListMetricsBody
    };

    await handler(req as any);
  });

  it('should handle empty search key', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock permission aggregation response
    vi.mocked(getEvaluationPermissionAggregation).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isOwner: false,
      roleList: [],
      myGroupMap: new Map(),
      myOrgSet: new Set()
    });

    const mockQuery = {
      lean: vi.fn().mockResolvedValue([])
    };
    const mockSkip = {
      limit: vi.fn().mockReturnValue(mockQuery)
    };
    const mockSort = {
      skip: vi.fn().mockReturnValue(mockSkip)
    };
    const mockFind = {
      sort: vi.fn().mockReturnValue(mockSort)
    };

    vi.mocked(MongoEvalMetric.find).mockReturnValue(mockFind as any);
    vi.mocked(MongoEvalMetric.countDocuments).mockResolvedValue(0);
    vi.mocked(addSourceMember).mockResolvedValue([]);

    const req = {
      body: {
        pageNum: 1,
        pageSize: 10,
        searchKey: '   ' // whitespace only
      } as ListMetricsBody,
      auth: {
        userId: mockUserId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    await handler(req as any);

    // Verify database query without search filter (whitespace is trimmed)
    expect(MongoEvalMetric.find).toHaveBeenCalledWith({
      $or: [
        {
          _id: {
            $in: []
          }
        },
        {
          tmbId: new Types.ObjectId(mockTmbId)
        }
      ],
      teamId: new Types.ObjectId(mockTeamId)
    });
  });

  it('should handle pagination correctly', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const mockQuery = {
      lean: vi.fn().mockResolvedValue([])
    };
    const mockSkip = {
      limit: vi.fn().mockReturnValue(mockQuery)
    };
    const mockSort = {
      skip: vi.fn().mockReturnValue(mockSkip)
    };
    const mockFind = {
      sort: vi.fn().mockReturnValue(mockSort)
    };

    vi.mocked(MongoEvalMetric.find).mockReturnValue(mockFind as any);
    vi.mocked(MongoEvalMetric.countDocuments).mockResolvedValue(0);
    vi.mocked(addSourceMember).mockResolvedValue([]);

    const req = {
      body: {
        pageNum: 3,
        pageSize: 5
      } as ListMetricsBody
    };

    await handler(req as any);

    // Verify pagination: page 3 with size 5 = skip 10, limit 5
    expect(mockSort.skip).toHaveBeenCalledWith(10);
    expect(mockSkip.limit).toHaveBeenCalledWith(5);
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authUserPer).mockRejectedValue(authError);

    const req = {
      body: {
        pageNum: 1,
        pageSize: 10
      } as ListMetricsBody
    };

    await expect(handler(req as any)).rejects.toThrow('Authentication failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.find).not.toHaveBeenCalled();
  });

  it('should handle database query failure', async () => {
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const dbError = new Error('Database query failed');
    vi.mocked(MongoEvalMetric.find).mockImplementation(() => {
      throw dbError;
    });

    const req = {
      body: {
        pageNum: 1,
        pageSize: 10
      } as ListMetricsBody
    };

    await expect(handler(req as any)).rejects.toBe('Failed to fetch evaluation metrics');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.find).toHaveBeenCalled();
  });
});
