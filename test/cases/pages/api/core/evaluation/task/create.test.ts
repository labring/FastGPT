import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as createHandler } from '@/pages/api/core/evaluation/task/create';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import {
  checkTeamAIPoints,
  checkTeamEvaluationTaskLimit
} from '@fastgpt/service/support/permission/teamLimit';
import { validateTargetConfig } from '@fastgpt/service/core/evaluation/target';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvalDatasetCollection } from '@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    createEvaluation: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn(),
  checkTeamEvaluationTaskLimit: vi.fn()
}));

vi.mock('@fastgpt/service/core/evaluation/common', () => ({
  authEvaluationTaskCreate: vi.fn().mockResolvedValue({
    teamId: new Types.ObjectId().toString(),
    tmbId: new Types.ObjectId().toString()
  })
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@fastgpt/service/core/evaluation/target', () => ({
  validateTargetConfig: vi.fn().mockResolvedValue({
    isValid: false,
    errors: [{ code: 'target_validation_failed', message: 'Target validation failed' }]
  })
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/evalDatasetCollectionSchema', () => ({
  MongoEvalDatasetCollection: {
    findOne: vi.fn()
  }
}));

describe('Create Evaluation Task API Handler', () => {
  const mockEvaluation = {
    _id: new Types.ObjectId(),
    name: 'Test Evaluation',
    description: 'Test Description',
    evalDatasetCollectionId: new Types.ObjectId(),
    target: {
      type: 'workflow',
      config: {
        appId: new Types.ObjectId().toString()
      }
    },
    evaluators: [
      {
        metric: {
          _id: new Types.ObjectId().toString(),
          name: 'Test Metric',
          type: 'ai_model'
        }
      }
    ],
    usageId: new Types.ObjectId(),
    status: EvaluationStatusEnum.queuing,
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    createTime: new Date(),
    updateTime: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    vi.mocked(checkTeamAIPoints).mockResolvedValue(undefined);
    vi.mocked(checkTeamEvaluationTaskLimit).mockResolvedValue(undefined);

    // Mock dataset exists for all tests
    (MongoEvalDatasetCollection.findOne as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        teamId: new Types.ObjectId(),
        name: 'Test Dataset'
      })
    });
  });

  test('应该成功创建评估任务', async () => {
    const mockTeamId = new Types.ObjectId().toString();
    const mockTmbId = new Types.ObjectId().toString();

    // Update mock to return consistent IDs
    const { authEvaluationTaskCreate } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskCreate as any).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId
    });

    const mockReq = {
      method: 'POST',
      body: {
        name: 'Test Evaluation',
        description: 'Test Description',
        evalDatasetCollectionId: new Types.ObjectId().toString(),
        target: {
          type: 'workflow',
          config: {
            appId: new Types.ObjectId().toString()
          }
        },
        evaluators: [
          {
            metric: {
              _id: new Types.ObjectId().toString(),
              name: 'Test Metric',
              type: 'ai_model',
              config: { llm: 'gpt-4', prompt: 'test' },
              dependencies: ['llm'],
              teamId: new Types.ObjectId().toString(),
              tmbId: new Types.ObjectId().toString(),
              createTime: new Date(),
              updateTime: new Date()
            },
            runtimeConfig: { llm: 'gpt-4' }
          }
        ]
      }
    } as any;

    (checkTeamAIPoints as any).mockResolvedValue(undefined);
    (validateTargetConfig as any).mockResolvedValue({ isValid: true, errors: [] });
    (EvaluationTaskService.createEvaluation as any).mockResolvedValue(mockEvaluation);

    const result = await createHandler(mockReq);

    expect(EvaluationTaskService.createEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Evaluation',
        description: 'Test Description',
        evalDatasetCollectionId: mockReq.body.evalDatasetCollectionId,
        target: mockReq.body.target,
        evaluators: mockReq.body.evaluators,
        autoStart: undefined, // 用户未传递 autoStart 参数时应该是 undefined，服务层会设置默认值
        teamId: mockTeamId,
        tmbId: mockTmbId
      })
    );
    expect(result).toEqual(mockEvaluation);
  });

  test('应该成功创建评估任务并自动启动', async () => {
    const mockTeamId = new Types.ObjectId().toString();
    const mockTmbId = new Types.ObjectId().toString();

    // Update mock to return consistent IDs
    const { authEvaluationTaskCreate } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskCreate as any).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId
    });

    const mockAutoStartEvaluation = {
      ...mockEvaluation,
      status: EvaluationStatusEnum.evaluating // 自动启动后状态应该是 evaluating
    };

    const mockReq = {
      method: 'POST',
      body: {
        name: 'Test Evaluation',
        description: 'Test Description',
        evalDatasetCollectionId: new Types.ObjectId().toString(),
        target: {
          type: 'workflow',
          config: {
            appId: new Types.ObjectId().toString()
          }
        },
        evaluators: [
          {
            metric: {
              _id: new Types.ObjectId().toString(),
              name: 'Test Metric',
              type: 'ai_model',
              config: { llm: 'gpt-4', prompt: 'test' },
              dependencies: ['llm'],
              teamId: new Types.ObjectId().toString(),
              tmbId: new Types.ObjectId().toString(),
              createTime: new Date(),
              updateTime: new Date()
            },
            runtimeConfig: { llm: 'gpt-4' }
          }
        ],
        autoStart: true // 测试自动启动
      }
    } as any;

    (checkTeamAIPoints as any).mockResolvedValue(undefined);
    (validateTargetConfig as any).mockResolvedValue({ isValid: true, errors: [] });
    (EvaluationTaskService.createEvaluation as any).mockResolvedValue(mockAutoStartEvaluation);

    const result = await createHandler(mockReq);

    expect(EvaluationTaskService.createEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Evaluation',
        description: 'Test Description',
        evalDatasetCollectionId: mockReq.body.evalDatasetCollectionId,
        target: mockReq.body.target,
        evaluators: mockReq.body.evaluators,
        autoStart: true,
        teamId: mockTeamId,
        tmbId: mockTmbId
      })
    );
    expect(result).toEqual(mockAutoStartEvaluation);
    expect(result.status).toBe(EvaluationStatusEnum.evaluating);
  });

  test('应该支持显式关闭自动启动', async () => {
    const mockTeamId = new Types.ObjectId().toString();
    const mockTmbId = new Types.ObjectId().toString();

    // Update mock to return consistent IDs
    const { authEvaluationTaskCreate } = await import('@fastgpt/service/core/evaluation/common');
    (authEvaluationTaskCreate as any).mockResolvedValue({
      teamId: mockTeamId,
      tmbId: mockTmbId
    });

    const mockReq = {
      method: 'POST',
      body: {
        name: 'Test Evaluation',
        description: 'Test Description',
        evalDatasetCollectionId: new Types.ObjectId().toString(),
        target: {
          type: 'workflow',
          config: {
            appId: new Types.ObjectId().toString()
          }
        },
        evaluators: [
          {
            metric: {
              _id: new Types.ObjectId().toString(),
              name: 'Test Metric',
              type: 'ai_model',
              config: { llm: 'gpt-4', prompt: 'test' },
              dependencies: ['llm'],
              teamId: new Types.ObjectId().toString(),
              tmbId: new Types.ObjectId().toString(),
              createTime: new Date(),
              updateTime: new Date()
            },
            runtimeConfig: { llm: 'gpt-4' }
          }
        ],
        autoStart: false // 显式关闭自动启动
      }
    } as any;

    (checkTeamAIPoints as any).mockResolvedValue(undefined);
    (validateTargetConfig as any).mockResolvedValue({ isValid: true, errors: [] });
    (EvaluationTaskService.createEvaluation as any).mockResolvedValue(mockEvaluation); // 状态仍然是 queuing

    const result = await createHandler(mockReq);

    expect(EvaluationTaskService.createEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Evaluation',
        description: 'Test Description',
        evalDatasetCollectionId: mockReq.body.evalDatasetCollectionId,
        target: mockReq.body.target,
        evaluators: mockReq.body.evaluators,
        autoStart: false,
        teamId: mockTeamId,
        tmbId: mockTmbId
      })
    );
    expect(result).toEqual(mockEvaluation);
    expect(result.status).toBe(EvaluationStatusEnum.queuing); // 未自动启动，状态保持为 queuing
  });

  test('应该拒绝空名称', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        name: '',
        evalDatasetCollectionId: new Types.ObjectId().toString(),
        target: {
          type: 'workflow',
          config: {
            appId: new Types.ObjectId().toString()
          }
        },
        evaluators: [
          {
            metric: {
              _id: new Types.ObjectId().toString(),
              name: 'Test Metric',
              type: 'ai_model',
              config: { llm: 'gpt-4', prompt: 'test' },
              dependencies: ['llm'],
              teamId: new Types.ObjectId().toString(),
              tmbId: new Types.ObjectId().toString(),
              createTime: new Date(),
              updateTime: new Date()
            },
            runtimeConfig: { llm: 'gpt-4' }
          }
        ]
      }
    } as any;

    await expect(createHandler(mockReq)).rejects.toThrow('evaluationNameRequired');
  });

  test('应该拒绝空指标列表', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        name: 'Test Evaluation',
        evalDatasetCollectionId: new Types.ObjectId().toString(),
        target: {
          type: 'workflow',
          config: {
            appId: new Types.ObjectId().toString()
          }
        },
        evaluators: []
      }
    } as any;

    // 由于target验证在前，空的evaluators测试会被target验证拦截，这里改为测试有效target但空evaluators的情况
    // 需要mock validateTargetConfig返回成功
    (validateTargetConfig as any).mockResolvedValue({ isValid: true, errors: [] });

    await expect(createHandler(mockReq)).rejects.toThrow('evaluationEvaluatorsRequired');
  });

  test('应该拒绝缺少必填字段', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        name: 'Test Evaluation'
        // 缺少 datasetId, target, evaluators
      }
    } as any;

    // 重置mock为默认的失败状态
    // (validateTargetConfig as any).mockResolvedValue({
    //   success: false,
    //   message: 'Target validation failed'
    // });

    // evalDatasetCollectionId 验证会先失败
    await expect(createHandler(mockReq)).rejects.toThrow('evaluationDatasetCollectionIdRequired');
  });
});
