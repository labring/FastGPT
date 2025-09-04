import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/delete';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authEvalMetric } from '@fastgpt/service/support/permission/evaluation/auth';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    findById: vi.fn(),
    findByIdAndDelete: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/evaluation/auth', () => ({
  authEvalMetric: vi.fn()
}));

describe('/api/core/evaluation/metric/delete', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockMetricId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete a custom metric successfully', async () => {
    // Mock auth response for the new auth function
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric found - custom type
    const mockMetric = {
      _id: mockMetricId,
      name: 'Test Metric',
      type: EvalMetricTypeEnum.Custom
    };
    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);
    vi.mocked(MongoEvalMetric.findByIdAndDelete).mockResolvedValue(mockMetric);

    const req = {
      query: {
        id: mockMetricId
      },
      auth: {
        userId: '507f1f77bcf86cd799439013',
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    const result = await handler(req as any, {} as any);

    // Verify auth was called correctly
    expect(authEvalMetric).toHaveBeenCalledWith({
      req,
      authToken: true,
      authApiKey: true,
      metricId: mockMetricId,
      per: expect.any(Number)
    });

    // Verify metric lookup
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);

    // Verify deletion
    expect(MongoEvalMetric.findByIdAndDelete).toHaveBeenCalledWith(mockMetricId);

    // Verify empty response
    expect(result).toEqual({});
  });

  it('should reject when id parameter is missing', async () => {
    const req = {
      query: {}
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Missing required parameter: id');

    // Verify no auth or database calls were made
    expect(authEvalMetric).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('should reject when id parameter is empty string', async () => {
    const req = {
      query: {
        id: ''
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Missing required parameter: id');

    expect(authEvalMetric).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('should reject when metric is not found', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric not found
    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(null);

    const req = {
      query: {
        id: mockMetricId
      },
      auth: {
        userId: '507f1f77bcf86cd799439013',
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Metric not found');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(MongoEvalMetric.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('should reject when trying to delete builtin metric', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric found - builtin type
    const mockMetric = {
      _id: mockMetricId,
      name: 'Builtin Metric',
      type: EvalMetricTypeEnum.Builtin
    };
    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const req = {
      query: {
        id: mockMetricId
      },
      auth: {
        userId: '507f1f77bcf86cd799439013',
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Builtin metrics cannot be deleted');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(MongoEvalMetric.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authEvalMetric).mockRejectedValue(authError);

    const req = {
      query: {
        id: mockMetricId
      },
      auth: {
        userId: '507f1f77bcf86cd799439013',
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Authentication failed');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('should handle database findById failure', async () => {
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    const dbError = new Error('Database query failed');
    vi.mocked(MongoEvalMetric.findById).mockRejectedValue(dbError);

    const req = {
      query: {
        id: mockMetricId
      },
      auth: {
        userId: '507f1f77bcf86cd799439013',
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Database query failed');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(MongoEvalMetric.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('should handle database deletion failure', async () => {
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    const mockMetric = {
      _id: mockMetricId,
      name: 'Test Metric',
      type: EvalMetricTypeEnum.Custom
    };
    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const dbError = new Error('Database deletion failed');
    vi.mocked(MongoEvalMetric.findByIdAndDelete).mockRejectedValue(dbError);

    const req = {
      query: {
        id: mockMetricId
      },
      auth: {
        userId: '507f1f77bcf86cd799439013',
        teamId: mockTeamId,
        tmbId: mockTmbId,
        appId: '',
        authType: 'token' as any,
        sourceName: undefined,
        apikey: '',
        isRoot: false
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Database deletion failed');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(MongoEvalMetric.findByIdAndDelete).toHaveBeenCalledWith(mockMetricId);
  });
});
