import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import {
  AiModelEvaluator,
  createEvaluatorInstance
} from '@fastgpt/service/core/evaluation/evaluator';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type {
  CreateMetricParams,
  EvalCase,
  MetricDependency
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '@fastgpt/service/support/permission/type';
import { CalculateMethodEnum } from '@fastgpt/global/core/evaluation/constants';
import { Types } from '@fastgpt/service/common/mongo';

// Mock getAppEvaluationScore
vi.mock('@fastgpt/service/core/evaluation/evaluator/scoring', () => ({
  getAppEvaluationScore: vi.fn().mockResolvedValue({
    score: 85,
    usage: { inputTokens: 100, outputTokens: 50 }
  })
}));

import { getAppEvaluationScore } from '@fastgpt/service/core/evaluation/evaluator/scoring';

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  parseHeaderCert: vi.fn()
}));

import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

describe('EvaluationMetricService - AI Model Only', () => {
  let teamId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    teamId = '507f1f77bcf86cd799439011';
    auth = { req: {} as any, authToken: true };
  });

  afterAll(async () => {
    await MongoEvalMetric.deleteMany({ teamId });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (parseHeaderCert as any).mockResolvedValue({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(teamId)
    });
  });

  describe('createMetric', () => {
    test('应该成功创建 AI 模型指标', async () => {
      const params: CreateMetricParams = {
        name: 'GPT-4 Evaluation Metric',
        description: 'AI-powered evaluation using GPT-4',
        type: 'ai_model',
        config: {
          llm: 'gpt-4',
          prompt: 'Please evaluate the quality of this response...'
        }
      };

      const metric = await EvaluationMetricService.createMetric(params, auth);

      expect(metric.name).toBe(params.name);
      expect(metric.description).toBe(params.description);
      expect(metric.type).toBe('ai_model');
      expect(metric.config).toEqual(params.config);
      expect(metric.teamId.toString()).toBe(teamId);
      expect(metric.tmbId.toString()).toBe(teamId);
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: '',
        type: 'ai_model' as const,
        config: { llm: 'gpt-4' }
      };

      await expect(
        EvaluationMetricService.createMetric(invalidParams as any, auth)
      ).rejects.toThrow('name: Path `name` is required');
    });

    test('不支持的指标类型应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Metric',
        type: 'unsupported_type' as any,
        config: { llm: 'gpt-4' }
      };

      await expect(EvaluationMetricService.createMetric(invalidParams, auth)).rejects.toThrow(
        'unsupported_type` is not a valid enum value for path `type`'
      );
    });
  });

  describe('getMetric', () => {
    test('应该成功获取指标', async () => {
      const created = await EvaluationMetricService.createMetric(
        {
          name: 'AI Metric for Get Test',
          description: 'AI metric for get test',
          type: 'ai_model',
          config: { llm: 'gpt-4', prompt: 'Test prompt' }
        },
        auth
      );

      const metric = await EvaluationMetricService.getMetric(created._id, auth);

      expect(metric._id.toString()).toBe(created._id.toString());
      expect(metric.name).toBe('AI Metric for Get Test');
      expect(metric.type).toBe('ai_model');
    });

    test('指标不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationMetricService.getMetric(nonExistentId, auth)).rejects.toThrow(
        'Metric not found'
      );
    });
  });

  describe('listMetrics', () => {
    test('应该成功获取指标列表', async () => {
      const result = await EvaluationMetricService.listMetrics(auth, 1, 10);

      expect(result.metrics).toBeInstanceOf(Array);
      expect(result.total).toBeGreaterThanOrEqual(0);
      if (result.total > 0) {
        expect(result.metrics.every((metric) => metric.type === 'ai_model')).toBe(true);
      }
    });

    test('应该支持搜索功能', async () => {
      await EvaluationMetricService.createMetric(
        {
          name: 'AI Search Test',
          type: 'ai_model',
          config: { llm: 'gpt-4', prompt: 'Test prompt' }
        },
        auth
      );

      const result = await EvaluationMetricService.listMetrics(auth, 1, 10, 'AI');

      expect(result.total).toBeGreaterThan(0);
      expect(result.metrics.some((metric) => metric.name.includes('AI'))).toBe(true);
    });
  });
});

describe('AiModelEvaluator', () => {
  let aiEvaluator: AiModelEvaluator;
  let testCase: EvalCase;
  let mockMetricConfig: any;

  beforeEach(() => {
    mockMetricConfig = {
      _id: 'test-ai-metric-id',
      name: 'Test AI Metric',
      type: 'ai_model',
      config: {
        llm: 'gpt-4',
        prompt: 'Please evaluate the quality of this response based on accuracy...'
      },
      dependencies: ['llm'] as MetricDependency[],
      teamId: 'team-id',
      tmbId: 'tmb-id',
      createTime: new Date(),
      updateTime: new Date()
    };

    const evaluatorConfig = {
      metric: mockMetricConfig,
      runtimeConfig: { llm: 'gpt-4' },
      weight: 1.0,
      thresholdValue: 0.8,
      calculateType: CalculateMethodEnum.mean
    };
    aiEvaluator = new AiModelEvaluator(evaluatorConfig);

    testCase = {
      userInput: 'What is the capital of France?',
      expectedOutput: 'Paris',
      actualOutput: 'The capital of France is Paris.'
    };
  });

  test('应该成功执行 AI 模型评估', async () => {
    const result = await aiEvaluator.evaluate(testCase);

    expect(result.metricId).toBe('test-ai-metric-id');
    expect(result.metricName).toBe('Test AI Metric');
    expect(result.score).toBe(85);
    expect(result.details?.model).toBe('gpt-4');
    expect(getAppEvaluationScore).toHaveBeenCalledWith({
      userInput: testCase.userInput,
      appAnswer: testCase.actualOutput,
      standardAnswer: testCase.expectedOutput,
      model: 'gpt-4',
      prompt: expect.any(String)
    });
  });

  test('应该处理 AI 评估错误', async () => {
    (getAppEvaluationScore as any).mockRejectedValueOnce(new Error('AI service error'));

    await expect(aiEvaluator.evaluate(testCase)).rejects.toThrow('AI service error');
  });

  test('应该验证模型可用性', async () => {
    const isValid = await aiEvaluator.validate();
    expect(isValid).toBe(true);
  });
});

describe('createEvaluatorInstance', () => {
  test('应该创建 AI 模型评估器实例', () => {
    const metricConfig = {
      _id: 'metric-id',
      name: 'Test AI Metric',
      type: 'ai_model' as const,
      config: { llm: 'gpt-4', prompt: 'Test prompt' },
      dependencies: ['llm'] as MetricDependency[],
      teamId: 'team-id',
      tmbId: 'tmb-id',
      createTime: new Date(),
      updateTime: new Date()
    };

    const evaluatorConfig = {
      metric: metricConfig,
      runtimeConfig: { llm: 'gpt-4' },
      weight: 1.0,
      thresholdValue: 0.8,
      calculateType: CalculateMethodEnum.mean
    };

    const instance = createEvaluatorInstance(evaluatorConfig);

    expect(instance).toBeInstanceOf(AiModelEvaluator);
    expect(instance.getName()).toBe('Test AI Metric');
  });

  test('应该处理未知指标类型', () => {
    const metricConfig = {
      _id: 'metric-id',
      name: 'Unknown Metric',
      type: 'unknown' as any,
      config: { llm: 'gpt-4', prompt: 'test' },
      dependencies: [],
      teamId: 'team-id',
      tmbId: 'tmb-id',
      createTime: new Date(),
      updateTime: new Date()
    };

    const evaluatorConfig = {
      metric: metricConfig,
      runtimeConfig: {},
      weight: 1.0,
      thresholdValue: 0.8,
      calculateType: CalculateMethodEnum.mean
    };

    expect(() => createEvaluatorInstance(evaluatorConfig)).toThrow(
      "Unsupported metric type: unknown. Only 'ai_model' is currently supported."
    );
  });
});
