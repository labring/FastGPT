import { CalculateMethodEnum, SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { MongoEvalMetric } from '../metric/schema';

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
 * Build evaluation data configuration
 * @param metricIds Array of metric IDs
 * @param defaultThreshold Default threshold value
 * @returns Array of evaluation data configuration
 */
export function buildEvalDataConfig(
  metricIds: string[],
  defaultThreshold: number = 80
): Array<{
  metricsId: string;
  metricsScore: number;
  thresholdValue: number;
  summaryStatus: SummaryStatusEnum;
  weight: number;
}> {
  if (!metricIds || metricIds.length === 0) {
    return [];
  }

  const weights = calculateMetricWeights(metricIds.length);

  return metricIds.map((metricId, index) => ({
    metricsId: metricId,
    metricsScore: 0, // Initial score is 0
    thresholdValue: defaultThreshold,
    summaryStatus: SummaryStatusEnum.pending,
    weight: weights[index]
  }));
}
