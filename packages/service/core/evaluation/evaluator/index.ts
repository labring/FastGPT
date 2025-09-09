import type {
  EvalMetricSchemaType,
  EvalCase,
  MetricResult,
  EvaluationResponse,
  MetricConfig,
  EvalModelConfigType
} from '@fastgpt/global/core/evaluation/metric/type';
import type { EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';
import { getLLMModel, getEmbeddingModel } from '../../ai/model';
import { createDitingClient } from './ditingClient';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export abstract class Evaluator {
  protected metricConfig: MetricConfig;
  protected llmConfig?: EvalModelConfigType;
  protected embeddingConfig?: EvalModelConfigType;

  constructor(
    metricConfig: MetricConfig,
    llmConfig?: EvalModelConfigType,
    embeddingConfig?: EvalModelConfigType
  ) {
    this.llmConfig = llmConfig;
    this.embeddingConfig = embeddingConfig;
    this.metricConfig = metricConfig;
  }

  abstract evaluate(evalCase: EvalCase): Promise<MetricResult>;
}

export class DitingEvaluator extends Evaluator {
  private client: ReturnType<typeof createDitingClient>;

  constructor(
    metricConfig: MetricConfig,
    llmConfig?: EvalModelConfigType,
    embeddingConfig?: EvalModelConfigType
  ) {
    super(metricConfig, llmConfig, embeddingConfig);
    this.client = createDitingClient();
  }

  async evaluate(evalCase: EvalCase): Promise<MetricResult> {
    const response: EvaluationResponse = await this.client.runEvaluation({
      evalCase: evalCase,
      metricConfig: this.metricConfig,
      embeddingConfig: this.embeddingConfig,
      llmConfig: this.llmConfig
    });

    return {
      metricName: this.metricConfig.metricName,
      status: response.status,
      data: response.data,
      usages: response.usages,
      error: response.error,
      totalPoints: 0
    };
  }
}

export function createEvaluatorInstance(evaluatorConfig: EvaluatorSchema): Evaluator {
  if (evaluatorConfig.metric.llmRequired && !evaluatorConfig.runtimeConfig?.llm) {
    throw new Error(EvaluationErrEnum.evaluatorLLmConfigMissing);
  }

  if (evaluatorConfig.metric.embeddingRequired && !evaluatorConfig.runtimeConfig?.embedding) {
    throw new Error(EvaluationErrEnum.evaluatorEmbeddingConfigMissing);
  }

  const metricConfig: MetricConfig = {
    metricName: evaluatorConfig.metric.name,
    metricType: evaluatorConfig.metric.type,
    prompt: evaluatorConfig.metric.prompt
  };

  let llmConfig: EvalModelConfigType | undefined = undefined;
  let embeddingConfig: EvalModelConfigType | undefined = undefined;

  if (evaluatorConfig.runtimeConfig?.llm) {
    try {
      const llm = getLLMModel(evaluatorConfig.runtimeConfig.llm);
      llmConfig = {
        name: evaluatorConfig.runtimeConfig.llm,
        baseUrl: llm.requestUrl ?? undefined,
        apiKey: llm.requestAuth ?? undefined
      };
    } catch (err) {
      throw new Error(EvaluationErrEnum.evaluatorLLmModelNotFound);
    }
  }

  if (evaluatorConfig.runtimeConfig?.embedding) {
    try {
      const embedding = getEmbeddingModel(evaluatorConfig.runtimeConfig.embedding);
      embeddingConfig = {
        name: evaluatorConfig.runtimeConfig.embedding,
        baseUrl: embedding.requestUrl ?? undefined,
        apiKey: embedding.requestAuth ?? undefined
      };
    } catch (err) {
      throw new Error(EvaluationErrEnum.evaluatorEmbeddingModelNotFound);
    }
  }

  return new DitingEvaluator(metricConfig, llmConfig, embeddingConfig);
}
