import { beforeEach, describe, test, expect, vi } from 'vitest';
import { DitingEvaluator } from '@fastgpt/service/core/evaluation/evaluator';
import { createDitingClient } from '@fastgpt/service/core/evaluation/evaluator/ditingClient';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import type {
  MetricConfig,
  EvalModelConfigType
} from '@fastgpt/global/core/evaluation/metric/type';

// Mock the diting client
vi.mock('@fastgpt/service/core/evaluation/evaluator/ditingClient', () => ({
  createDitingClient: vi.fn()
}));

describe('Score Scaling Tests', () => {
  let evaluator: DitingEvaluator;
  let mockMetricConfig: MetricConfig;
  let mockRunEvaluation: any;

  beforeEach(() => {
    mockMetricConfig = {
      metricName: 'test-metric',
      metricType: EvalMetricTypeEnum.Builtin,
      prompt: 'Test prompt'
    };

    // Set up the mock
    mockRunEvaluation = vi.fn().mockResolvedValue({
      status: 'success',
      data: {
        score: 0.8, // Original score from diting
        reason: 'Test evaluation reason'
      },
      usages: []
    });

    (createDitingClient as any).mockReturnValue({
      runEvaluation: mockRunEvaluation
    });
  });

  test('should apply default score scaling (100x amplification)', async () => {
    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should be 0.8 * 100 = 80 with default scaling of 100
    expect(result.data?.score).toBe(80);
  });

  test('should apply custom score scaling (200x amplification)', async () => {
    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 200);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should be 0.8 * 200 = 160
    expect(result.data?.score).toBe(160);
  });

  test('should apply custom score scaling (1x amplification)', async () => {
    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 1);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should be 0.8 * 1 = 0.8
    expect(result.data?.score).toBe(0.8);
  });

  test('should apply fractional score scaling (0.5x amplification)', async () => {
    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 0.5);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should be 0.8 * 0.5 = 0.4
    expect(result.data?.score).toBe(0.4);
  });

  test('should apply very small fractional scaling (0.01x for 100x reduction)', async () => {
    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 0.01);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should be 0.8 * 0.01 = 0.008
    expect(result.data?.score).toBe(0.008);
  });

  test('should apply precise decimal scaling (1.5x amplification)', async () => {
    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 1.5);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should be 0.8 * 1.5 = 1.2 (allowing for floating point precision)
    expect(result.data?.score).toBeCloseTo(1.2, 10);
  });

  test('should handle undefined score', async () => {
    // Override mock for this specific test
    mockRunEvaluation.mockResolvedValue({
      status: 'success',
      data: {
        score: undefined,
        reason: 'Test evaluation reason'
      },
      usages: []
    });

    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 200);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should remain undefined
    expect(result.data?.score).toBeUndefined();
  });

  test('should handle null score', async () => {
    // Override mock for this specific test
    mockRunEvaluation.mockResolvedValue({
      status: 'success',
      data: {
        score: null,
        reason: 'Test evaluation reason'
      },
      usages: []
    });

    evaluator = new (DitingEvaluator as any)(mockMetricConfig, undefined, undefined, 150);

    const result = await evaluator.evaluate({
      userInput: 'test input',
      expectedOutput: 'test expected',
      actualOutput: 'test actual'
    });

    // Score should remain null (scaling not applied to null values)
    expect(result.data?.score).toBeNull();
  });
});
