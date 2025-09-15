import { CalculateMethodEnum, SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvalMetric } from '../../metric/schema';
import type { EvaluatorSchema, SummaryConfig } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '../../../../common/system/log';

/**
 * Automatically assign metric weights
 * @param metricCount Number of metrics
 * @returns Weight array, each element is an integer percentage
 */
export function calculateMetricWeights(metricCount: number): number[] {
  if (metricCount <= 0) {
    return [];
  }

  if (metricCount === 1) {
    return [100];
  }

  // Calculate base weight (rounded down)
  const baseWeight = Math.floor(100 / metricCount);

  // Calculate remaining weight
  const remainder = 100 - baseWeight * metricCount;

  // Assign weights
  const weights: number[] = new Array(metricCount).fill(baseWeight);

  // Assign remaining weight to the last metric
  weights[metricCount - 1] += remainder;

  return weights;
}

/**
 * Get default threshold from environment variables or use fallback
 * @returns Default threshold value
 */
function getDefaultThreshold(): number {
  const threshold = process.env.EVALUATION_DEFAULT_THRESHOLD
    ? Number(process.env.EVALUATION_DEFAULT_THRESHOLD)
    : 80;
  // Validate threshold is within valid range
  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    addLog.warn(
      `[getDefaultThreshold] Invalid EVALUATION_DEFAULT_THRESHOLD value: ${process.env.EVALUATION_DEFAULT_THRESHOLD}. Using default: 80`
    );
    return 80;
  }
  return threshold;
}

/**
 * Build evaluation default configuration
 * Returns both cleaned evaluators (without summaryConfig) and separate summaryConfigs array
 */
export function buildEvalDataConfig(evaluators: EvaluatorSchema[]): {
  evaluators: EvaluatorSchema[];
  summaryConfigs: SummaryConfig[];
} {
  if (!evaluators || evaluators.length === 0) {
    return { evaluators: [], summaryConfigs: [] };
  }

  const weights = calculateMetricWeights(evaluators.length);
  const defaultThreshold = getDefaultThreshold();

  // Clean evaluators without summaryConfig
  const cleanedEvaluators = evaluators.map((evaluator) => ({
    metric: evaluator.metric,
    runtimeConfig: evaluator.runtimeConfig,
    thresholdValue: evaluator.thresholdValue ?? defaultThreshold
  }));

  // Create separate summaryConfigs array with metric relationship
  const summaryConfigs = evaluators.map((evaluator, index) => ({
    metricId: evaluator.metric._id.toString(),
    metricName: evaluator.metric.name,
    weight: weights[index],
    calculateType: CalculateMethodEnum.mean,
    score: 0,
    summary: '',
    summaryStatus: SummaryStatusEnum.pending,
    errorReason: '',
    completedItemCount: 0,
    overThresholdItemCount: 0,
    thresholdPassRate: 0
  }));

  addLog.debug('[buildEvalDataConfig] Processed configuration:', {
    evaluators: cleanedEvaluators.map((evaluator, index) => ({
      metricId: evaluator.metric._id,
      metricName: evaluator.metric.name,
      thresholdValue: evaluator.thresholdValue,
      summaryConfig: summaryConfigs[index]
    }))
  });

  return {
    evaluators: cleanedEvaluators,
    summaryConfigs
  };
}
