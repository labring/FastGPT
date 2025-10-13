import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type {
  EvaluatorSchema,
  EvaluationParamsType,
  EvaluationParamsWithDeafultConfigType
} from '@fastgpt/global/core/evaluation/type';
import { addLog } from '../../../../common/system/log';
import { CalculateMethodEnum } from '@fastgpt/global/core/evaluation/constants';

export function calculateMetricWeights(metricCount: number): number[] {
  if (metricCount <= 0) {
    return [];
  }

  if (metricCount === 1) {
    return [100];
  }

  const baseWeight = Math.floor(100 / metricCount);
  const remainder = 100 - baseWeight * metricCount;
  const weights: number[] = new Array(metricCount).fill(baseWeight);
  weights[metricCount - 1] += remainder;

  return weights;
}

function getDefaultThreshold(): number {
  const threshold = global.systemEnv?.evalConfig?.caseResultThreshold || 0.8;
  if (isNaN(threshold) || threshold < 0 || threshold > 1) {
    addLog.warn(
      `[getDefaultThreshold] Invalid caseResultThreshold value: ${threshold}. Using default: 0.8`
    );
    return 0.8;
  }
  return threshold;
}

// Build evaluation configuration with cleaned evaluators and separate summaryConfigs
export function buildEvalDataConfig(
  evaluationParams: EvaluationParamsType
): EvaluationParamsWithDeafultConfigType {
  const evaluators = evaluationParams?.evaluators || [];

  if (!evaluators || evaluators.length === 0) {
    return {
      ...evaluationParams,
      evaluators: [],
      summaryData: {
        calculateType: CalculateMethodEnum.mean,
        summaryConfigs: []
      }
    };
  }

  const weights = calculateMetricWeights(evaluators.length);
  const caseResultThreshold = getDefaultThreshold();

  const cleanedEvaluators: EvaluatorSchema[] = evaluators.map((evaluator) => ({
    metric: evaluator.metric,
    runtimeConfig: evaluator.runtimeConfig,
    thresholdValue: evaluator.thresholdValue ?? caseResultThreshold
  }));

  const summaryConfigs = evaluators.map((evaluator, index) => ({
    metricId: evaluator.metric._id.toString(),
    metricName: evaluator.metric.name,
    weight: weights[index],
    summary: '',
    summaryStatus: SummaryStatusEnum.pending,
    errorReason: ''
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
    ...evaluationParams,
    evaluators: cleanedEvaluators,
    summaryData: {
      calculateType: CalculateMethodEnum.mean,
      summaryConfigs
    }
  };
}
