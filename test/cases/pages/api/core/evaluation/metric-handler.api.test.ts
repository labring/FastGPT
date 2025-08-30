import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';

// Import API handlers directly - use named imports
import { handler as createHandler } from '@/pages/api/core/evaluation/metric/create';
import { handler as listHandler } from '@/pages/api/core/evaluation/metric/list';
import { handler as detailHandler } from '@/pages/api/core/evaluation/metric/detail';
import { handler as updateHandler } from '@/pages/api/core/evaluation/metric/update';
import { handler as deleteHandler } from '@/pages/api/core/evaluation/metric/delete';
import { handler as testHandler } from '@/pages/api/core/evaluation/metric/test';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/metric', () => ({
  EvaluationMetricService: {
    createMetric: vi.fn(),
    listMetrics: vi.fn(),
    getMetric: vi.fn(),
    updateMetric: vi.fn(),
    deleteMetric: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/evaluator', () => ({
  createEvaluatorInstance: vi.fn().mockReturnValue({
    evaluate: vi.fn()
  })
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn().mockResolvedValue({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId()
  })
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import { createEvaluatorInstance } from '@fastgpt/service/core/evaluation/evaluator';
import { addLog } from '@fastgpt/service/common/system/log';
// Define metric types as strings since enum doesn't exist
const EvaluationMetricTypeEnum = {
  http: 'http',
  function: 'function',
  aiModel: 'ai_model'
} as const;

describe('Metric API Handler Tests (Direct Function Calls)', () => {
  const mockMetric = {
    _id: new Types.ObjectId(),
    name: 'Test Metric',
    description: 'Test Description',
    type: EvaluationMetricTypeEnum.aiModel,
    config: {
      model: 'gpt-4',
      prompt: 'Please evaluate the response quality'
    },
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    createTime: new Date(),
    updateTime: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Metric Handler', () => {
    test('应该成功创建AI模型指标', async () => {
      const mockReq = {
        body: {
          name: 'Test AI Model Metric',
          description: 'Test Description',
          type: 'ai_model',
          config: {
            model: 'gpt-4',
            prompt: 'Please evaluate the response quality'
          }
        }
      } as any;

      (EvaluationMetricService.createMetric as any).mockResolvedValue(mockMetric);

      const result = await createHandler(mockReq);

      expect(EvaluationMetricService.createMetric).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test AI Model Metric',
          description: 'Test Description',
          type: EvaluationMetricTypeEnum.aiModel,
          config: mockReq.body.config
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockMetric);
      expect(addLog.info).toHaveBeenCalledWith(
        '[Evaluation Metric] Metric created successfully',
        expect.objectContaining({
          metricId: mockMetric._id,
          name: mockMetric.name,
          type: mockMetric.type
        })
      );
    });

    test('应该成功创建另一个AI模型指标', async () => {
      const mockReq = {
        body: {
          name: 'Test AI Model Metric 2',
          description: 'Test Description',
          type: EvaluationMetricTypeEnum.aiModel,
          config: {
            model: 'gpt-3.5-turbo',
            prompt: 'Evaluate the accuracy on a scale of 1-100'
          }
        }
      } as any;

      const aiMetric2 = {
        ...mockMetric,
        type: EvaluationMetricTypeEnum.aiModel,
        name: 'Test AI Model Metric 2'
      };
      (EvaluationMetricService.createMetric as any).mockResolvedValue(aiMetric2);

      const result = await createHandler(mockReq);

      expect(result.type).toBe(EvaluationMetricTypeEnum.aiModel);
    });

    test('应该成功创建AI模型指标', async () => {
      const mockReq = {
        body: {
          name: 'Test AI Metric',
          description: 'Test Description',
          type: EvaluationMetricTypeEnum.aiModel,
          config: {
            model: 'gpt-4',
            prompt:
              '请评估答案的准确性，问题：{{userInput}}，预期答案：{{expectedOutput}}，实际答案：{{actualOutput}}'
          }
        }
      } as any;

      const aiMetric = { ...mockMetric, type: EvaluationMetricTypeEnum.aiModel };
      (EvaluationMetricService.createMetric as any).mockResolvedValue(aiMetric);

      const result = await createHandler(mockReq);

      expect(result.type).toBe(EvaluationMetricTypeEnum.aiModel);
    });

    test('应该拒绝空名称', async () => {
      const mockReq = {
        body: {
          name: '',
          type: EvaluationMetricTypeEnum.aiModel,
          config: { model: 'gpt-4', prompt: 'test' }
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Metric name is required');
    });

    test('应该拒绝无效指标类型', async () => {
      const mockReq = {
        body: {
          name: 'Test Metric',
          type: 'invalid',
          config: {}
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Unsupported metric type: invalid');
    });

    test('应该拒绝缺少配置', async () => {
      const mockReq = {
        body: {
          name: 'Test Metric',
          type: EvaluationMetricTypeEnum.aiModel
          // 缺少 config
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Metric config is required');
    });
  });

  describe('List Metrics Handler', () => {
    test('应该成功获取指标列表', async () => {
      const mockReq = {
        body: { pageNum: 1, pageSize: 10 }
      } as any;

      const mockResult = {
        metrics: [mockMetric],
        total: 1
      };

      (EvaluationMetricService.listMetrics as any).mockResolvedValue(mockResult);

      const result = await listHandler(mockReq);

      expect(EvaluationMetricService.listMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        undefined
      );
      expect(result).toEqual({
        list: mockResult.metrics,
        total: mockResult.total
      });
    });

    test('应该处理搜索和类型过滤参数', async () => {
      const mockReq = {
        body: {
          pageNum: 1,
          pageSize: 10,
          searchKey: 'test search'
        }
      } as any;

      const mockResult = { metrics: [], total: 0 };
      (EvaluationMetricService.listMetrics as any).mockResolvedValue(mockResult);

      await listHandler(mockReq);

      expect(EvaluationMetricService.listMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        'test search'
      );
    });
  });

  describe('Get Metric Detail Handler', () => {
    test('应该成功获取指标详情', async () => {
      const metricId = new Types.ObjectId().toString();
      const mockReq = {
        query: { metricId: metricId }
      } as any;

      (EvaluationMetricService.getMetric as any).mockResolvedValue(mockMetric);

      const result = await detailHandler(mockReq);

      expect(EvaluationMetricService.getMetric).toHaveBeenCalledWith(
        metricId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockMetric);
    });

    test('应该拒绝缺少ID的请求', async () => {
      const mockReq = {
        query: {}
      } as any;

      await expect(detailHandler(mockReq)).rejects.toMatch('Metric ID is required');
    });
  });

  describe('Update Metric Handler', () => {
    test('应该成功更新指标', async () => {
      const metricId = new Types.ObjectId().toString();
      const mockReq = {
        body: {
          metricId: metricId,
          name: 'Updated Metric',
          description: 'Updated Description',
          config: {
            url: 'https://api.updated.com/metric',
            method: 'PUT'
          }
        }
      } as any;

      (EvaluationMetricService.updateMetric as any).mockResolvedValue(undefined);

      const result = await updateHandler(mockReq);

      expect(EvaluationMetricService.updateMetric).toHaveBeenCalledWith(
        metricId,
        expect.objectContaining({
          name: 'Updated Metric',
          description: 'Updated Description',
          config: mockReq.body.config
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Metric updated successfully' });
    });
  });

  describe('Delete Metric Handler', () => {
    test('应该成功删除指标', async () => {
      const metricId = new Types.ObjectId().toString();
      const mockReq = {
        query: { metricId: metricId }
      } as any;

      (EvaluationMetricService.deleteMetric as any).mockResolvedValue(undefined);

      const result = await deleteHandler(mockReq);

      expect(EvaluationMetricService.deleteMetric).toHaveBeenCalledWith(
        metricId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Metric deleted successfully' });
    });
  });

  describe('Test Metric Handler', () => {
    test('应该成功测试指标', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          metricId: new Types.ObjectId().toString(),
          testCase: {
            userInput: 'What is AI?',
            expectedOutput: 'AI stands for Artificial Intelligence',
            actualOutput: 'Artificial Intelligence'
          }
        }
      } as any;

      const mockTestResult = {
        metricId: mockReq.body.metricId,
        metricName: 'Test Metric',
        score: 85,
        details: { similarity: 0.85 }
      };

      // Mock the getMetric call to return the metric
      (EvaluationMetricService.getMetric as any).mockResolvedValue(mockMetric);

      // Mock the evaluator instance to return test result
      const mockEvaluator = {
        evaluate: vi.fn().mockResolvedValue(mockTestResult)
      };
      (createEvaluatorInstance as any).mockReturnValue(mockEvaluator);

      const result = await testHandler(mockReq);

      expect(EvaluationMetricService.getMetric).toHaveBeenCalledWith(
        mockReq.body.metricId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(createEvaluatorInstance).toHaveBeenCalledWith({
        metric: mockMetric,
        runtimeConfig: {}
      });
      expect(mockEvaluator.evaluate).toHaveBeenCalledWith(mockReq.body.testCase);
      expect(result).toEqual(mockTestResult);
    });

    test('应该拒绝缺少指标ID的请求', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          testCase: {
            userInput: 'What is AI?',
            expectedOutput: 'Expected answer',
            actualOutput: 'Actual answer'
          }
        }
      } as any;

      await expect(testHandler(mockReq)).rejects.toMatch('Metric ID is required');
    });

    test('应该拒绝缺少测试数据的请求', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          metricId: new Types.ObjectId().toString()
        }
      } as any;

      await expect(testHandler(mockReq)).rejects.toMatch('Test case is required');
    });
  });
});
