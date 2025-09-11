import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { handler as createHandler } from '@/pages/api/core/evaluation/task/create';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import {
  checkTeamAIPoints,
  checkTeamEvaluationTaskLimit
} from '@fastgpt/service/support/permission/teamLimit';
import { validateTargetConfig } from '@fastgpt/service/core/evaluation/target';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';

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
    success: false,
    message: 'Target validation failed'
  })
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('Create Evaluation Task API Handler', () => {
  const mockEvaluation = {
    _id: new Types.ObjectId(),
    name: 'Test Evaluation',
    description: 'Test Description',
    datasetId: new Types.ObjectId(),
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
        datasetId: new Types.ObjectId().toString(),
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
    (validateTargetConfig as any).mockResolvedValue({ success: true, message: 'Valid' });
    (EvaluationTaskService.createEvaluation as any).mockResolvedValue(mockEvaluation);

    const result = await createHandler(mockReq);

    expect(EvaluationTaskService.createEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test Evaluation',
        description: 'Test Description',
        datasetId: mockReq.body.datasetId,
        target: mockReq.body.target,
        evaluators: mockReq.body.evaluators,
        teamId: mockTeamId,
        tmbId: mockTmbId
      })
    );
    expect(result).toEqual(mockEvaluation);
  });

  test('应该拒绝空名称', async () => {
    const mockReq = {
      method: 'POST',
      body: {
        name: '',
        datasetId: new Types.ObjectId().toString(),
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
        datasetId: new Types.ObjectId().toString(),
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
    (validateTargetConfig as any).mockResolvedValue({ success: true, message: 'Valid' });

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

    // datasetId 验证会先失败
    await expect(createHandler(mockReq)).rejects.toThrow('evaluationDatasetIdRequired');
  });
});
