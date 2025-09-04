import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/update';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authEvalMetric } from '@fastgpt/service/support/permission/evaluation/auth';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { UpdateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/evaluation/auth', () => ({
  authEvalMetric: vi.fn()
}));

describe('/api/core/evaluation/metric/update', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockUserId = '507f1f77bcf86cd799439013';
  const mockMetricId = '507f1f77bcf86cd799439014';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update a custom metric successfully with all fields', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric found - custom type
    const mockMetric = {
      _id: mockMetricId,
      name: 'Old Metric',
      description: 'Old Description',
      prompt: 'Old Prompt',
      type: EvalMetricTypeEnum.Custom,
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-01'),
      save: vi.fn().mockResolvedValue(true)
    };

    // Apply updates to the mock metric
    mockMetric.name = 'Updated Metric';
    mockMetric.description = 'Updated Description';
    mockMetric.prompt = 'Updated Prompt';

    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Updated Metric',
        description: 'Updated Description',
        prompt: 'Updated Prompt'
      } as UpdateMetricBody,
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

    // Verify save was called
    expect(mockMetric.save).toHaveBeenCalled();

    // Verify response
    expect(result).toEqual({
      id: mockMetricId,
      name: 'Updated Metric',
      description: 'Updated Description',
      type: EvalMetricTypeEnum.Custom,
      createTime: mockMetric.createTime,
      updateTime: mockMetric.updateTime
    });
  });

  it('should update a custom metric with partial fields', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric found - custom type
    const mockMetric = {
      _id: mockMetricId,
      name: 'Old Metric',
      description: 'Old Description',
      prompt: 'Old Prompt',
      type: EvalMetricTypeEnum.Custom,
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-01'),
      save: vi.fn().mockResolvedValue(true)
    };

    // Only update name
    mockMetric.name = 'Updated Metric Only';

    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Updated Metric Only'
        // description and prompt not provided
      } as UpdateMetricBody,
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

    const result = await handler(req as any, {} as any);

    // Verify save was called
    expect(mockMetric.save).toHaveBeenCalled();

    // Verify response - only name should be updated
    expect(result).toEqual({
      id: mockMetricId,
      name: 'Updated Metric Only',
      description: 'Old Description',
      type: EvalMetricTypeEnum.Custom,
      createTime: mockMetric.createTime,
      updateTime: mockMetric.updateTime
    });
  });

  it('should reject when id is missing', async () => {
    // Mock auth to fail due to missing id
    vi.mocked(authEvalMetric).mockRejectedValue(new Error('Evaluation metric ID is required'));

    const req = {
      body: {
        name: 'Test Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toThrow(
      'Evaluation metric ID is required'
    );

    // Auth should be called but database should not
    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
  });

  it('should reject when id is empty string', async () => {
    // Mock auth to fail due to empty id
    vi.mocked(authEvalMetric).mockRejectedValue(new Error('Evaluation metric ID is required'));

    const req = {
      body: {
        id: '',
        name: 'Test Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toThrow(
      'Evaluation metric ID is required'
    );

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
  });

  it('should reject when metric is not found', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric not found
    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(null);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Test Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toBe('Metric not found');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
  });

  it('should reject when trying to update builtin metric', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
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
      type: EvalMetricTypeEnum.Builtin,
      save: vi.fn()
    };
    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Updated Builtin Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toBe('Builtin metric cannot be modified');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(mockMetric.save).not.toHaveBeenCalled();
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authEvalMetric).mockRejectedValue(authError);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Test Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toThrow('Authentication failed');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).not.toHaveBeenCalled();
  });

  it('should handle database findById failure', async () => {
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    const dbError = new Error('Database query failed');
    vi.mocked(MongoEvalMetric.findById).mockRejectedValue(dbError);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Test Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toThrow('Database query failed');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
  });

  it('should handle database save failure', async () => {
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    const mockMetric = {
      _id: mockMetricId,
      name: 'Test Metric',
      description: 'Test Description',
      prompt: 'Test Prompt',
      type: EvalMetricTypeEnum.Custom,
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-01'),
      save: vi.fn().mockRejectedValue(new Error('Database save failed'))
    };

    mockMetric.name = 'Updated Metric';

    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const req = {
      body: {
        id: mockMetricId,
        name: 'Updated Metric'
      } as UpdateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toThrow('Database save failed');

    expect(authEvalMetric).toHaveBeenCalled();
    expect(MongoEvalMetric.findById).toHaveBeenCalledWith(mockMetricId);
    expect(mockMetric.save).toHaveBeenCalled();
  });

  it('should handle empty update fields gracefully', async () => {
    // Mock auth response
    vi.mocked(authEvalMetric).mockResolvedValue({
      userId: mockUserId,
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      metric: {} as any
    });

    // Mock metric found - custom type
    const mockMetric = {
      _id: mockMetricId,
      name: 'Original Metric',
      description: 'Original Description',
      prompt: 'Original Prompt',
      type: EvalMetricTypeEnum.Custom,
      createTime: new Date('2024-01-01'),
      updateTime: new Date('2024-01-01'),
      save: vi.fn().mockResolvedValue(true)
    };

    vi.mocked(MongoEvalMetric.findById).mockResolvedValue(mockMetric);

    const req = {
      body: {
        id: mockMetricId
        // No name, description, or prompt provided
      } as UpdateMetricBody,
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

    const result = await handler(req as any, {} as any);

    // Verify save was still called
    expect(mockMetric.save).toHaveBeenCalled();

    // Verify response - nothing should be updated
    expect(result).toEqual({
      id: mockMetricId,
      name: 'Original Metric',
      description: 'Original Description',
      type: EvalMetricTypeEnum.Custom,
      createTime: mockMetric.createTime,
      updateTime: mockMetric.updateTime
    });
  });
});
