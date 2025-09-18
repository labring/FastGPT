import type {
  EvalMetricSchemaType,
  EvalCase,
  MetricResult,
  EvaluationResponse,
  MetricConfig,
  EvalModelConfigType
} from '@fastgpt/global/core/evaluation/metric/type';
import type { EvaluatorSchema } from '@fastgpt/global/core/evaluation/type';
import {
  Validatable,
  type ValidationResult,
  type ValidationError
} from '@fastgpt/global/core/evaluation/validate';
import { getLLMModel, getEmbeddingModel } from '../../ai/model';
import { createDitingClient } from './ditingClient';
import { formatModelChars2Points } from '../../../support/wallet/usage/utils';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';

export abstract class Evaluator extends Validatable {
  protected metricConfig: MetricConfig;
  protected llmConfig?: EvalModelConfigType;
  protected embeddingConfig?: EvalModelConfigType;
  protected evaluatorConfig?: EvaluatorSchema;

  constructor(
    metricConfig: MetricConfig,
    llmConfig?: EvalModelConfigType,
    embeddingConfig?: EvalModelConfigType,
    evaluatorConfig?: EvaluatorSchema
  ) {
    super();
    this.llmConfig = llmConfig;
    this.embeddingConfig = embeddingConfig;
    this.metricConfig = metricConfig;
    this.evaluatorConfig = evaluatorConfig;
  }

  abstract evaluate(evalCase: EvalCase): Promise<MetricResult>;

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    try {
      // Validate metric configuration requirements based on evaluatorConfig
      if (this.evaluatorConfig?.metric.llmRequired && !this.llmConfig) {
        errors.push({
          code: EvaluationErrEnum.evaluatorLLmConfigMissing,
          message: 'LLM configuration is required for this metric',
          field: 'llmConfig'
        });
      }

      if (this.evaluatorConfig?.metric.embeddingRequired && !this.embeddingConfig) {
        errors.push({
          code: EvaluationErrEnum.evaluatorEmbeddingConfigMissing,
          message: 'Embedding configuration is required for this metric',
          field: 'embeddingConfig'
        });
      }

      // Validate metric configuration
      if (!this.metricConfig) {
        errors.push({
          code: EvaluationErrEnum.evaluatorConfigRequired,
          message: 'Metric configuration is required',
          field: 'metricConfig'
        });
        return { isValid: false, errors, warnings };
      }

      if (!this.metricConfig.metricName) {
        errors.push({
          code: EvaluationErrEnum.evalMetricNameRequired,
          message: 'Metric name is required',
          field: 'metricConfig.metricName'
        });
      }

      if (!this.metricConfig.metricType) {
        errors.push({
          code: EvaluationErrEnum.evalMetricTypeRequired,
          message: 'Metric type is required',
          field: 'metricConfig.metricType'
        });
      }

      // Validate LLM configuration if provided
      if (this.llmConfig) {
        if (!this.llmConfig.name) {
          errors.push({
            code: EvaluationErrEnum.evaluatorLLmModelNotFound,
            message: 'LLM model name is required',
            field: 'llmConfig.name'
          });
        } else {
          try {
            getLLMModel(this.llmConfig.name);
          } catch (err) {
            errors.push({
              code: EvaluationErrEnum.evaluatorLLmModelNotFound,
              message: `LLM model '${this.llmConfig.name}' not found or not accessible`,
              field: 'llmConfig.name',
              debugInfo: {
                modelName: this.llmConfig.name,
                error: err instanceof Error ? err.message : String(err)
              }
            });
          }
        }
      }

      // Validate embedding configuration if provided
      if (this.embeddingConfig) {
        if (!this.embeddingConfig.name) {
          errors.push({
            code: EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
            message: 'Embedding model name is required',
            field: 'embeddingConfig.name'
          });
        } else {
          try {
            getEmbeddingModel(this.embeddingConfig.name);
          } catch (err) {
            errors.push({
              code: EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
              message: `Embedding model '${this.embeddingConfig.name}' not found or not accessible`,
              field: 'embeddingConfig.name',
              debugInfo: {
                modelName: this.embeddingConfig.name,
                error: err instanceof Error ? err.message : String(err)
              }
            });
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      errors.push({
        code: EvaluationErrEnum.evaluatorConfigRequired,
        message: `Evaluator validation failed: ${error instanceof Error ? error.message : String(error)}`,
        debugInfo: {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });

      return { isValid: false, errors, warnings };
    }
  }
}

export class DitingEvaluator extends Evaluator {
  private client: ReturnType<typeof createDitingClient>;
  private scoreScaling: number;

  constructor(
    metricConfig: MetricConfig,
    llmConfig?: EvalModelConfigType,
    embeddingConfig?: EvalModelConfigType,
    evaluatorConfig?: EvaluatorSchema,
    scoreScaling: number = 1
  ) {
    super(metricConfig, llmConfig, embeddingConfig, evaluatorConfig);
    this.client = createDitingClient();
    this.scoreScaling = scoreScaling;
  }

  async evaluate(evalCase: EvalCase): Promise<MetricResult> {
    const response: EvaluationResponse = await this.client.runEvaluation({
      evalCase: evalCase,
      metricConfig: this.metricConfig,
      embeddingConfig: this.embeddingConfig,
      llmConfig: this.llmConfig
    });

    // Calculate total points from usages
    let totalPoints = 0;
    if (response.usages && response.usages.length > 0) {
      for (const usage of response.usages) {
        if (usage.promptTokens || usage.completionTokens) {
          const modelType =
            usage.modelType === 'embed' ? ModelTypeEnum.embedding : ModelTypeEnum.llm;
          const model =
            modelType === ModelTypeEnum.embedding
              ? this.embeddingConfig?.name
              : this.llmConfig?.name;

          if (model) {
            const { totalPoints: usagePoints } = formatModelChars2Points({
              model,
              modelType,
              inputTokens: usage.promptTokens || 0,
              outputTokens: usage.completionTokens || 0
            });
            totalPoints += usagePoints;
          }
        }
      }
    }

    // Apply score scaling if data.score exists
    // scoreScaling directly multiplies the original score (e.g., 1 means no scaling, 100 means 100x amplification)
    let scaledData = response.data;
    if (response.data?.score !== undefined && response.data?.score !== null) {
      scaledData = {
        ...response.data,
        score: response.data.score * this.scoreScaling
      };
    }

    return {
      metricName: this.metricConfig.metricName,
      status: response.status,
      data: scaledData,
      usages: response.usages,
      error: response.error,
      totalPoints
    };
  }
}

export async function createEvaluatorInstance(
  evaluatorConfig: EvaluatorSchema,
  options: { validate?: boolean } = { validate: true }
): Promise<Evaluator> {
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

  const scoreScaling = evaluatorConfig.scoreScaling ?? 1;
  const evaluatorInstance = new DitingEvaluator(
    metricConfig,
    llmConfig,
    embeddingConfig,
    evaluatorConfig,
    scoreScaling
  );

  // Validate instance if requested (default behavior)
  if (options.validate) {
    const validationResult = await evaluatorInstance.validate();
    if (!validationResult.isValid) {
      const errorMessages = validationResult.errors
        .map((err) => `${err.code}: ${err.message}`)
        .join('; ');
      throw new Error(`Evaluator instance validation failed: ${errorMessages}`);
    }
  }

  return evaluatorInstance;
}

export async function validateEvaluatorConfig(
  evaluatorConfig: EvaluatorSchema
): Promise<ValidationResult> {
  try {
    const evaluatorInstance = await createEvaluatorInstance(evaluatorConfig, { validate: false });
    return await evaluatorInstance.validate();
  } catch (error) {
    // If we can't even create the instance, return validation error
    return {
      isValid: false,
      errors: [
        {
          code: EvaluationErrEnum.evalEvaluatorInvalidConfig,
          message: `Failed to create evaluator instance: ${error instanceof Error ? error.message : String(error)}`,
          debugInfo: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            metricType: evaluatorConfig.metric?.type
          }
        }
      ]
    };
  }
}
