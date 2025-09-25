import { describe, test, expect, vi, beforeEach } from 'vitest';
import {
  validateEvaluatorConfig,
  createEvaluatorInstance
} from '@fastgpt/service/core/evaluation/evaluator';
import type { EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

// Mock dependencies
vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn().mockReturnValue({
    requestUrl: 'https://api.test.com',
    requestAuth: 'test-key'
  }),
  getEmbeddingModel: vi.fn().mockReturnValue({
    requestUrl: 'https://api.test.com',
    requestAuth: 'test-key'
  })
}));

vi.mock('@fastgpt/service/core/evaluation/evaluator/ditingClient', () => ({
  createDitingClient: vi.fn().mockReturnValue({
    runEvaluation: vi.fn()
  })
}));

describe('Evaluator Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('validateEvaluatorConfig should return valid result for correct config', async () => {
    const evaluatorConfig: EvaluatorSchema = {
      metric: {
        _id: 'test-metric-id',
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id',
        name: 'Test Metric',
        type: EvalMetricTypeEnum.Builtin,
        userInputRequired: true,
        actualOutputRequired: true,
        expectedOutputRequired: true,
        contextRequired: false,
        retrievalContextRequired: false,
        embeddingRequired: false,
        llmRequired: true,
        createTime: new Date(),
        updateTime: new Date()
      },
      runtimeConfig: {
        llm: 'gpt-4'
      }
    };

    const result = await validateEvaluatorConfig(evaluatorConfig);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('validateEvaluatorConfig should return invalid result when LLM required but not provided', async () => {
    const evaluatorConfig: EvaluatorSchema = {
      metric: {
        _id: 'test-metric-id',
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id',
        name: 'Test Metric',
        type: EvalMetricTypeEnum.Builtin,
        userInputRequired: true,
        actualOutputRequired: true,
        expectedOutputRequired: true,
        contextRequired: false,
        retrievalContextRequired: false,
        embeddingRequired: false,
        llmRequired: true,
        createTime: new Date(),
        updateTime: new Date()
      },
      runtimeConfig: {} // No LLM provided
    };

    const result = await validateEvaluatorConfig(evaluatorConfig);

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(EvaluationErrEnum.evaluatorLLmConfigMissing);
  });

  test('validateEvaluatorConfig should return invalid result when embedding required but not provided', async () => {
    const evaluatorConfig: EvaluatorSchema = {
      metric: {
        _id: 'test-metric-id',
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id',
        name: 'Test Metric',
        type: EvalMetricTypeEnum.Builtin,
        userInputRequired: true,
        actualOutputRequired: true,
        expectedOutputRequired: true,
        contextRequired: false,
        retrievalContextRequired: false,
        embeddingRequired: true,
        llmRequired: false,
        createTime: new Date(),
        updateTime: new Date()
      },
      runtimeConfig: {} // No embedding provided
    };

    const result = await validateEvaluatorConfig(evaluatorConfig);

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(EvaluationErrEnum.evaluatorEmbeddingConfigMissing);
  });

  test('validateEvaluatorConfig should handle instance creation failure', async () => {
    const evaluatorConfig: EvaluatorSchema = {
      metric: {
        _id: 'test-metric-id',
        teamId: 'test-team-id',
        tmbId: 'test-tmb-id',
        name: 'Test Metric',
        type: EvalMetricTypeEnum.Builtin,
        userInputRequired: true,
        actualOutputRequired: true,
        expectedOutputRequired: true,
        contextRequired: false,
        retrievalContextRequired: false,
        embeddingRequired: false,
        llmRequired: true,
        createTime: new Date(),
        updateTime: new Date()
      },
      runtimeConfig: {
        llm: 'invalid-model-name'
      }
    };

    // Mock getLLMModel to throw an error
    const { getLLMModel } = await import('@fastgpt/service/core/ai/model');
    (getLLMModel as any).mockImplementation(() => {
      throw new Error('Model not found');
    });

    const result = await validateEvaluatorConfig(evaluatorConfig);

    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe(EvaluationErrEnum.evalEvaluatorInvalidConfig);
    expect(result.errors[0].message).toContain('Failed to create evaluator instance');
  });
});
