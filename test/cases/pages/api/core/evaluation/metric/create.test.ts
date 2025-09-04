import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { handler } from '@/pages/api/core/evaluation/metric/create';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type { CreateMetricBody } from '@fastgpt/global/core/evaluation/metric/api';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    create: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authUserPer: vi.fn()
}));

describe('/api/core/evaluation/metric/create', () => {
  const mockTeamId = '507f1f77bcf86cd799439011';
  const mockTmbId = '507f1f77bcf86cd799439012';
  const mockMetricId = '507f1f77bcf86cd799439013';
  const mockDate = new Date('2024-01-01T00:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a metric successfully with all fields', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock database create response
    const mockMetric = {
      _id: mockMetricId,
      name: 'Test Metric',
      description: 'Test Description',
      createTime: mockDate,
      updateTime: mockDate
    };
    vi.mocked(MongoEvalMetric.create).mockResolvedValue(mockMetric as any);

    const req = {
      body: {
        name: 'Test Metric',
        description: 'Test Description',
        prompt: 'Test prompt for evaluation'
      } as CreateMetricBody,
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
    expect(authUserPer).toHaveBeenCalledWith({
      req,
      authToken: true,
      authApiKey: true,
      per: expect.any(Number)
    });

    // Verify database create was called correctly
    expect(MongoEvalMetric.create).toHaveBeenCalledWith({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      name: 'Test Metric',
      description: 'Test Description',
      type: EvalMetricTypeEnum.Custom,
      prompt: 'Test prompt for evaluation',
      createTime: mockDate,
      updateTime: mockDate
    });

    // Verify response
    expect(result).toEqual({
      id: mockMetricId,
      name: 'Test Metric',
      description: 'Test Description',
      createTime: mockDate,
      updateTime: mockDate
    });
  });

  it('should create a metric successfully without description', async () => {
    // Mock auth response
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    // Mock database create response
    const mockMetric = {
      _id: mockMetricId,
      name: 'Test Metric',
      description: '',
      createTime: mockDate,
      updateTime: mockDate
    };
    vi.mocked(MongoEvalMetric.create).mockResolvedValue(mockMetric as any);

    const req = {
      body: {
        name: 'Test Metric',
        prompt: 'Test prompt for evaluation'
      } as CreateMetricBody,
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

    // Verify database create was called with empty description
    expect(MongoEvalMetric.create).toHaveBeenCalledWith({
      teamId: mockTeamId,
      tmbId: mockTmbId,
      name: 'Test Metric',
      description: '',
      type: EvalMetricTypeEnum.Custom,
      prompt: 'Test prompt for evaluation',
      createTime: mockDate,
      updateTime: mockDate
    });

    expect(result).toEqual({
      id: mockMetricId,
      name: 'Test Metric',
      description: '',
      createTime: mockDate,
      updateTime: mockDate
    });
  });

  it('should reject when name is missing', async () => {
    // Mock auth response (auth happens before validation)
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        prompt: 'Test prompt for evaluation'
      } as CreateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toBe(
      'Metric name is required and must be a non-empty string'
    );

    // Auth should be called but database should not
    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.create).not.toHaveBeenCalled();
  });

  it('should reject when name is empty string', async () => {
    // Mock auth response (auth happens before validation)
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        name: '',
        prompt: 'Test prompt for evaluation'
      } as CreateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toBe(
      'Metric name is required and must be a non-empty string'
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.create).not.toHaveBeenCalled();
  });

  it('should reject when prompt is missing', async () => {
    // Mock auth response (auth happens before validation)
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        name: 'Test Metric'
      } as CreateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toBe(
      'Metric prompt is required and must be a non-empty string'
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.create).not.toHaveBeenCalled();
  });

  it('should reject when prompt is empty string', async () => {
    // Mock auth response (auth happens before validation)
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const req = {
      body: {
        name: 'Test Metric',
        prompt: ''
      } as CreateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toBe(
      'Metric prompt is required and must be a non-empty string'
    );

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.create).not.toHaveBeenCalled();
  });

  it('should handle auth failure', async () => {
    const authError = new Error('Authentication failed');
    vi.mocked(authUserPer).mockRejectedValue(authError);

    const req = {
      body: {
        name: 'Test Metric',
        prompt: 'Test prompt for evaluation'
      } as CreateMetricBody,
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

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.create).not.toHaveBeenCalled();
  });

  it('should handle database creation failure', async () => {
    vi.mocked(authUserPer).mockResolvedValue({
      userId: '507f1f77bcf86cd799439013',
      teamId: mockTeamId,
      tmbId: mockTmbId,
      isRoot: false,
      permission: {} as any,
      tmb: {} as any
    });

    const dbError = new Error('Database creation failed');
    vi.mocked(MongoEvalMetric.create).mockRejectedValue(dbError);

    const req = {
      body: {
        name: 'Test Metric',
        prompt: 'Test prompt for evaluation'
      } as CreateMetricBody,
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

    await expect(handler(req as any, {} as any)).rejects.toThrow('Database creation failed');

    expect(authUserPer).toHaveBeenCalled();
    expect(MongoEvalMetric.create).toHaveBeenCalled();
  });
});
