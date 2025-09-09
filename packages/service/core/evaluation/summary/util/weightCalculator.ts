import { CalculateMethodEnum, SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvalMetric } from '../../metric/schema';
import type { EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';
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
    console.warn(
      `[getDefaultThreshold] Invalid EVALUATION_DEFAULT_THRESHOLD value: ${process.env.EVALUATION_DEFAULT_THRESHOLD}. Using default: 80`
    );
    return 80;
  }
  console.log(
    `[getDefaultThreshold] Using threshold: ${threshold} (from ${process.env.EVALUATION_DEFAULT_THRESHOLD ? 'env' : 'default'})`
  );
  return threshold;
}

/**
 * Build evaluation default configuration
 */
export function buildEvalDataConfig(evaluators: EvaluatorSchema[]): EvaluatorSchema[] {
  if (!evaluators || evaluators.length === 0) {
    return [];
  }

  const weights = calculateMetricWeights(evaluators.length);
  const defaultThreshold = getDefaultThreshold();

  const result = evaluators.map((evaluator, index) => ({
    ...evaluator,
    weight: evaluator.weight ?? weights[index], // 如果已有权重则保留，否则使用计算的权重
    thresholdValue: evaluator.thresholdValue ?? defaultThreshold, // 如果已有阈值则保留，否则使用环境配置的默认值
    summaryStatus: evaluator.summaryStatus ?? SummaryStatusEnum.pending,
    calculateType: evaluator.calculateType ?? CalculateMethodEnum.mean,
    metricsScore: evaluator.metricsScore ?? 0
  }));

  addLog.debug('[buildEvalDataConfig] 处理后的evaluators:', {
    evaluators: result.map((evaluator) => ({
      metricId: evaluator.metric._id,
      metricName: evaluator.metric.name,
      weight: evaluator.weight,
      thresholdValue: evaluator.thresholdValue,
      calculateType: evaluator.calculateType,
      summaryStatus: evaluator.summaryStatus
    }))
  });

  return result;
}
