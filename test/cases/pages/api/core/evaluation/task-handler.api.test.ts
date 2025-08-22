import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';

// Import API handlers directly (not via HTTP wrapper) - use named imports
import { handler as createHandler } from '@/pages/api/core/evaluation/task/create';
import { handler as listHandler } from '@/pages/api/core/evaluation/task/list';
import { handler as detailHandler } from '@/pages/api/core/evaluation/task/detail';
import { handler as updateHandler } from '@/pages/api/core/evaluation/task/update';
import { handler as deleteHandler } from '@/pages/api/core/evaluation/task/delete';
import { handler as startHandler } from '@/pages/api/core/evaluation/task/start';
import { handler as stopHandler } from '@/pages/api/core/evaluation/task/stop';
import { handler as statsHandler } from '@/pages/api/core/evaluation/task/stats';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  EvaluationTaskService: {
    createEvaluation: vi.fn(),
    listEvaluations: vi.fn(),
    getEvaluation: vi.fn(),
    updateEvaluation: vi.fn(),
    deleteEvaluation: vi.fn(),
    startEvaluation: vi.fn(),
    stopEvaluation: vi.fn(),
    getEvaluationStats: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn().mockResolvedValue({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId()
  })
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

import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import { validateTargetConfig } from '@fastgpt/service/core/evaluation/target';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';

describe('Task API Handler Tests (Direct Function Calls)', () => {
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

  describe('Create Evaluation Handler', () => {
    test('应该成功创建评估任务', async () => {
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
          evaluators: mockReq.body.evaluators
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockEvaluation);
      expect(addLog.info).toHaveBeenCalledWith(
        '[Evaluation] Evaluation task created successfully',
        expect.objectContaining({
          evalId: mockEvaluation._id,
          name: mockEvaluation.name
        })
      );
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

      await expect(createHandler(mockReq)).rejects.toMatch('Evaluation name is required');
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

      await expect(createHandler(mockReq)).rejects.toMatch('At least one evaluator is required');
    });

    test('应该拒绝缺少必填字段', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          name: 'Test Evaluation'
          // 缺少 datasetId, target, metricIds
        }
      } as any;

      // 重置mock为默认的失败状态
      (validateTargetConfig as any).mockResolvedValue({
        success: false,
        message: 'Target validation failed'
      });

      // 由于没有target字段，target验证会先失败
      await expect(createHandler(mockReq)).rejects.toMatch('Target validation failed');
    });
  });

  describe('List Evaluations Handler', () => {
    test('应该成功获取评估任务列表', async () => {
      const mockReq = {
        body: {
          pageNum: 1,
          pageSize: 10
        }
      } as any;

      const mockResult = {
        evaluations: [mockEvaluation],
        total: 1
      };

      (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

      const result = await listHandler(mockReq);

      expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        undefined
      );
      expect(result).toEqual({
        list: mockResult.evaluations,
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

      const mockResult = { evaluations: [], total: 0 };
      (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

      await listHandler(mockReq);

      expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        2,
        20,
        'test search'
      );
    });

    test('应该使用默认分页参数', async () => {
      const mockReq = {
        body: {}
      } as any;

      const mockResult = { evaluations: [], total: 0 };
      (EvaluationTaskService.listEvaluations as any).mockResolvedValue(mockResult);

      await listHandler(mockReq);

      expect(EvaluationTaskService.listEvaluations).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1, // 默认页码
        20, // 默认页面大小
        undefined
      );
    });
  });

  describe('Get Evaluation Detail Handler', () => {
    test('应该成功获取评估任务详情', async () => {
      const evalId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'GET',
        query: { evalId: evalId }
      } as any;

      (EvaluationTaskService.getEvaluation as any).mockResolvedValue(mockEvaluation);

      const result = await detailHandler(mockReq);

      expect(EvaluationTaskService.getEvaluation).toHaveBeenCalledWith(
        evalId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockEvaluation);
    });

    test('应该拒绝缺少ID的请求', async () => {
      const mockReq = {
        method: 'GET',
        query: {}
      } as any;

      await expect(detailHandler(mockReq)).rejects.toMatch('Evaluation ID is required');
    });
  });

  describe('Update Evaluation Handler', () => {
    test('应该成功更新评估任务', async () => {
      const evalId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'PUT',
        body: {
          evalId: evalId,
          name: 'Updated Evaluation',
          description: 'Updated Description'
        }
      } as any;

      (EvaluationTaskService.updateEvaluation as any).mockResolvedValue(undefined);

      const result = await updateHandler(mockReq);

      expect(EvaluationTaskService.updateEvaluation).toHaveBeenCalledWith(
        evalId,
        expect.objectContaining({
          name: 'Updated Evaluation',
          description: 'Updated Description'
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Evaluation updated successfully' });
    });
  });

  describe('Delete Evaluation Handler', () => {
    test('应该成功删除评估任务', async () => {
      const evalId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'DELETE',
        query: { evalId: evalId }
      } as any;

      (EvaluationTaskService.deleteEvaluation as any).mockResolvedValue(undefined);

      const result = await deleteHandler(mockReq);

      expect(EvaluationTaskService.deleteEvaluation).toHaveBeenCalledWith(
        evalId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Evaluation deleted successfully' });
    });
  });

  describe('Start Evaluation Handler', () => {
    test('应该成功启动评估任务', async () => {
      const evalId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'POST',
        body: { evalId }
      } as any;

      (EvaluationTaskService.startEvaluation as any).mockResolvedValue(undefined);

      const result = await startHandler(mockReq);

      expect(EvaluationTaskService.startEvaluation).toHaveBeenCalledWith(
        evalId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Evaluation started successfully' });
    });

    test('应该拒绝缺少评估ID的请求', async () => {
      const mockReq = {
        method: 'POST',
        body: {}
      } as any;

      await expect(startHandler(mockReq)).rejects.toMatch('Evaluation ID is required');
    });
  });

  describe('Stop Evaluation Handler', () => {
    test('应该成功停止评估任务', async () => {
      const evalId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'POST',
        body: { evalId }
      } as any;

      (EvaluationTaskService.stopEvaluation as any).mockResolvedValue(undefined);

      const result = await stopHandler(mockReq);

      expect(EvaluationTaskService.stopEvaluation).toHaveBeenCalledWith(
        evalId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Evaluation stopped successfully' });
    });
  });

  describe('Get Evaluation Stats Handler', () => {
    test('应该成功获取评估任务统计信息', async () => {
      const evalId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'GET',
        query: { evalId }
      } as any;

      const mockStats = {
        total: 100,
        completed: 80,
        evaluating: 10,
        queuing: 5,
        error: 5,
        avgScore: 85.5
      };

      (EvaluationTaskService.getEvaluationStats as any).mockResolvedValue(mockStats);

      const result = await statsHandler(mockReq);

      expect(EvaluationTaskService.getEvaluationStats).toHaveBeenCalledWith(
        evalId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockStats);
    });

    test('应该拒绝缺少评估ID的请求', async () => {
      const mockReq = {
        method: 'GET',
        query: {}
      } as any;

      await expect(statsHandler(mockReq)).rejects.toMatch('Evaluation ID is required');
    });
  });
});
