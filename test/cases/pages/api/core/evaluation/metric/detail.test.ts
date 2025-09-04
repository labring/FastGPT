import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/detail';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    findById: vi.fn(() => ({
      lean: vi.fn()
    }))
  }
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn()
}));

describe('/api/core/evaluation/metric/detail', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockUserId = '507f1f77bcf86cd799439013';
  const mockMetricId = '507f1f77bcf86cd799439014';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return metric details successfully', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock metric data
    const mockMetric = {
      _id: mockMetricId,
      name: 'Test Metric',
      description: 'Test Description',
      type: 'custom',
      prompt: 'Test prompt for evaluation',
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-01'),
      teamId: mockTeamId,
      tmbId: mockTmbId
    };

    const mockQuery = {
      lean: vi.fn().mockResolvedValue(mockMetric)
    };

    vi.mocked(MongoEvalMetric.findById).mockReturnValue(mockQuery as any);

    const req = {
      query: {
        id: mockMetricId
      }
    };

    const result = await handler(req as any, {} as any);

    // Verify auth was called correctly
    expect(authUserPer).toHaveBeenCalledWith({
      req,
      authToken: true,
      authApiKey: true,
      per: expect.any(Number)
    });

    // Verify database query
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(mockQuery.lean).toHaveBeenCalled();

    // Verify response
    expect(result).toEqual(mockMetric);
  });

  it('should reject when id parameter is missing', async () => {
    const req = {
      query: {}
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Missing required parameter: id');

    // Verify no auth or database calls were made
    expect(authUserPer).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
  });

  it('should reject when id parameter is empty string', async () => {
    const req = {
      query: {
        id: ''
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Missing required parameter: id');

    expect(authUserPer).not.toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
  });

  it('should reject when metric is not found', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock metric not found
    const mockQuery = {
      lean: vi.fn().mockResolvedValue(null)
    };
    vi.mocked(MongoEvalMetric.findById).mockReturnValue(mockQuery as any);

    const req = {
      query: {
        id: mockMetricId
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toBe('Metric not found');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(mockQuery.lean).toHaveBeenCalled();
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authUserPer).mockRejectedValue(authError);

    const req = {
      query: {
        id: mockMetricId
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Authentication failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
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
    const mockQuery = {
      lean: vi.fn().mockRejectedValue(dbError)
    };
    vi.mocked(MongoEvalMetric.findById).mockReturnValue(mockQuery as any);

    const req = {
      query: {
        id: mockMetricId
      }
    };

    await expect(handler(req as any, {} as any)).rejects.toThrow('Database query failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(mockQuery.lean).toHaveBeenCalled();
  });

  it('should return metric with all fields when found', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock comprehensive metric data
    const mockMetric = {
      _id: mockMetricId,
      name: 'Comprehensive Test Metric',
      description: 'Comprehensive test description',
      type: 'custom',
      prompt: 'Comprehensive test prompt for evaluation',
      userInputRequired: true,
      actualOutputRequired: true,
      expectedOutputRequired: true,
      contextRequired: false,
      retrievalContextRequired: false,
      embeddingRequired: false,
      llmRequired: true,
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-02'),
      teamId: mockTeamId,
      tmbId: mockTmbId
    };

    const mockQuery = {
      lean: vi.fn().mockResolvedValue(mockMetric)
    };

    vi.mocked(MongoEvalMetric.findById).mockReturnValue(mockQuery as any);

    const req = {
      query: {
        id: mockMetricId
      }
    };

    const result = await handler(req as any, {} as any);

    // Verify all fields are returned correctly
    expect(result).toEqual(mockMetric);
    expect((result as any)._id).toBe(mockMetricId);
    expect((result as any).name).toBe('Comprehensive Test Metric');
    expect((result as any).description).toBe('Comprehensive test description');
    expect((result as any).type).toBe('custom');
    expect((result as any).prompt).toBe('Comprehensive test prompt for evaluation');
    expect((result as any).userInputRequired).toBe(true);
    expect((result as any).actualOutputRequired).toBe(true);
    expect((result as any).expectedOutputRequired).toBe(true);
    expect((result as any).contextRequired).toBe(false);
    expect((result as any).retrievalContextRequired).toBe(false);
    expect((result as any).embeddingRequired).toBe(false);
    expect((result as any).llmRequired).toBe(true);
  });
});
