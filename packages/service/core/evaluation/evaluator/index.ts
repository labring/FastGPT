import type {
  EvalMetricSchemaType,
  EvalCase,
  MetricResult,
  EvaluationResponse,
  MetricConfig,
  EvalModelConfigType
} from '@fastgpt/global/core/evaluation/metric/type';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { getLLMModel, getEmbeddingModel } from '../../ai/model';
import { createDitingClient } from './ditingClient';

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

export function createEvaluatorInstance(
  metricSchema: EvalMetricSchemaType,
  llmConfig?: EvalModelConfigType,
  embeddingConfig?: EvalModelConfigType
): Evaluator {
  if (metricSchema.type === EvalMetricTypeEnum.Custom && !metricSchema.prompt) {
    throw new Error('Custom metric must provide a prompt');
  }
  const metricConfig: MetricConfig = {
    metricName: metricSchema.name,
    metricType: metricSchema.type,
    prompt: metricSchema.prompt
  };

  if (llmConfig?.name) {
    try {
      const llm = getLLMModel(llmConfig.name);
      llmConfig = {
        ...llmConfig,
        baseUrl: llm.requestUrl || '',
        apiKey: llm.requestAuth || ''
      };
    } catch (err) {
      throw new Error(`Get LLM model failed: ${(err as Error).message}`);
    }
  }

  if (embeddingConfig?.name) {
    try {
      const embedding = getEmbeddingModel(embeddingConfig.name);
      embeddingConfig = {
        ...embeddingConfig,
        baseUrl: embedding.requestUrl || '',
        apiKey: embedding.requestAuth || ''
      };
    } catch (err) {
      throw new Error(`Get embedding model failed: ${(err as Error).message}`);
    }
  }

  return new DitingEvaluator(metricConfig, llmConfig, embeddingConfig);
}
