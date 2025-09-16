import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/list';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';
import { getBuiltinMetrics } from '@fastgpt/service/core/evaluation/metric/provider';
import { Types } from '@fastgpt/service/common/mongo';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    find: vi.fn()
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

vi.mock('@fastgpt/service/core/evaluation/metric/provider', () => ({
  getBuiltinMetrics: vi.fn()
}));

describe('/api/core/evaluation/metric/list', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockUserId = 'user123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list metrics successfully', async () => {
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

    // Mock custom metrics from database
    const mockCustomMetrics = [
      {
        _id: 'metric1',
        name: 'Custom Metric 1',
        description: 'Custom Description 1',
        createTime: new Date('2024-01-01'),
        updateTime: new Date('2024-01-01'),
        tmbId: mockTmbId,
        type: EvalMetricTypeEnum.Custom
      }
    ];

    // Mock builtin metrics
    const mockBuiltinMetrics = [
      {
        _id: 'builtin_accuracy',
        name: 'Accuracy',
        description: 'Accuracy metric',
        type: EvalMetricTypeEnum.Builtin,
        teamId: '',
        tmbId: '',
        createTime: new Date('2024-01-01'),
        updateTime: new Date('2024-01-01')
      }
    ];

    const mockCustomMetricsWithSource = [
      {
        ...mockCustomMetrics[0],
        sourceMember: { name: 'User 1', avatar: 'avatar1.png', status: 'active' as any },
        permission: { hasReadPer: true },
        private: true
      }
    ];

    vi.mocked(MongoEvalMetric.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCustomMetrics)
      })
    } as any);
    vi.mocked(addSourceMember).mockResolvedValue(mockCustomMetricsWithSource);
    vi.mocked(getBuiltinMetrics).mockResolvedValue(mockBuiltinMetrics);

    const req = {
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

    // Verify database query for custom metrics
    expect(MongoEvalMetric.find).toHaveBeenCalledWith({
      teamId: new Types.ObjectId(mockTeamId)
    });

    // Verify builtin metrics were fetched
    expect(getBuiltinMetrics).toHaveBeenCalled();

    // Verify source member addition for custom metrics only
    expect(addSourceMember).toHaveBeenCalledWith({
      list: expect.arrayContaining([
        expect.objectContaining({
          _id: 'metric1',
          name: 'Custom Metric 1',
          permission: expect.any(Object),
          private: expect.any(Boolean)
        })
      ])
    });

    // Verify response structure
    expect(result).toEqual({
      list: expect.arrayContaining([
        expect.objectContaining({
          _id: 'metric1',
          name: 'Custom Metric 1',
          sourceMember: expect.any(Object)
        }),
        expect.objectContaining({
          _id: 'builtin_accuracy',
          name: 'Accuracy',
          type: EvalMetricTypeEnum.Builtin
        })
      ])
    });
  });

  it('should handle owner permissions correctly', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock permission aggregation response with owner status
    vi.mocked(getEvaluationPermissionAggregation).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isOwner: true,
      roleList: [],
      myGroupMap: new Map(),
      myOrgSet: new Set()
    });

    const mockCustomMetrics = [
      {
        _id: 'metric1',
        name: 'Test Metric',
        description: 'Test Description',
        createTime: new Date('2024-01-01'),
        updateTime: new Date('2024-01-01'),
        tmbId: mockTmbId,
        type: EvalMetricTypeEnum.Custom
      }
    ];

    vi.mocked(MongoEvalMetric.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCustomMetrics)
      })
    } as any);
    vi.mocked(addSourceMember).mockResolvedValue(
      mockCustomMetrics.map((item) => ({
        ...item,
        sourceMember: { name: 'User', avatar: 'avatar.png', status: 'active' as any },
        permission: { hasReadPer: true },
        private: true
      }))
    );
    vi.mocked(getBuiltinMetrics).mockResolvedValue([]);

    const req = {
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

    // Verify that for owners, simple filter is used (no $or with accessible IDs)
    expect(MongoEvalMetric.find).toHaveBeenCalledWith({
      teamId: new Types.ObjectId(mockTeamId)
    });

    expect(result.list).toHaveLength(1);
  });

  it('should handle non-owner permissions with accessible resources', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock permission aggregation response with accessible resources
    const accessibleMetricId = '507f1f77bcf86cd799439020';
    vi.mocked(getEvaluationPermissionAggregation).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isOwner: false,
      roleList: [
        {
          resourceId: accessibleMetricId,
          tmbId: mockTmbId,
          permission: 1,
          groupId: null,
          orgId: null
        }
      ],
      myGroupMap: new Map(),
      myOrgSet: new Set()
    });

    vi.mocked(MongoEvalMetric.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      })
    } as any);
    vi.mocked(addSourceMember).mockResolvedValue([]);
    vi.mocked(getBuiltinMetrics).mockResolvedValue([]);

    const req = {
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

    // Verify database query with permission-based filter
    expect(MongoEvalMetric.find).toHaveBeenCalledWith({
      teamId: new Types.ObjectId(mockTeamId),
      $or: [
        {
          _id: {
            $in: [new Types.ObjectId(accessibleMetricId)]
          }
        },
        {
          tmbId: new Types.ObjectId(mockTmbId)
        }
      ]
    });
  });

  it('should filter metrics by permission', async () => {
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

    // Mock metrics where some don't have read permission
    const mockCustomMetrics = [
      {
        _id: 'metric1',
        name: 'Accessible Metric',
        tmbId: mockTmbId,
        createTime: new Date(),
        updateTime: new Date()
      },
      {
        _id: 'metric2',
        name: 'Inaccessible Metric',
        tmbId: 'other_user_id',
        createTime: new Date(),
        updateTime: new Date()
      }
    ];

    // Mock the custom metrics with different permission results
    const mockCustomWithPermissions = [
      {
        ...mockCustomMetrics[0],
        permission: { hasReadPer: true },
        private: true,
        sourceMember: { name: 'User', avatar: 'avatar.png', status: 'active' as any }
      },
      {
        ...mockCustomMetrics[1],
        permission: { hasReadPer: false },
        private: false
      }
    ];

    vi.mocked(MongoEvalMetric.find).mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockCustomMetrics)
      })
    } as any);
    vi.mocked(addSourceMember).mockResolvedValue([
      mockCustomWithPermissions[0] // Only the one with read permission
    ]);
    vi.mocked(getBuiltinMetrics).mockResolvedValue([]);

    const req = {
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

    // Verify that only metrics with read permission are included
    expect(result.list).toHaveLength(1);
    expect(result.list[0]).toEqual(
      expect.objectContaining({
        _id: 'metric1',
        name: 'Accessible Metric'
      })
    );
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authUserPer).mockRejectedValue(authError);

    const req = {
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

    vi.mocked(getEvaluationPermissionAggregation).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isOwner: false,
      roleList: [],
      myGroupMap: new Map(),
      myOrgSet: new Set()
    });

    const dbError = new Error('Database query failed');
    vi.mocked(MongoEvalMetric.find).mockImplementation(() => {
      throw dbError;
    });

    const req = {
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

    await expect(handler(req as any)).rejects.toThrow('Database query failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.find).toHaveBeenCalled();
  });
});
