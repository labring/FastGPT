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
import { getEvaluationModelById, getEmbeddingModelById } from '../../ai/model';
import { getModelEndpointConfig } from '../../ai/config';
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
        if (!this.llmConfig.modelId) {
          errors.push({
            code: EvaluationErrEnum.evaluatorLLmModelNotFound,
            message: 'LLM model modelId is required',
            field: 'llmConfig.modelId'
          });
        } else {
          const llm = getEvaluationModelById(this.llmConfig.modelId);
          if (!llm) {
            errors.push({
              code: EvaluationErrEnum.evaluatorLLmModelNotFound,
              message: `LLM model '${this.llmConfig.modelId}' not found or not accessible`,
              field: 'llmConfig.modelId'
            });
          }
        }
      }

      // Validate embedding configuration if provided
      if (this.embeddingConfig) {
        if (!this.embeddingConfig.modelId) {
          errors.push({
            code: EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
            message: 'Embedding model id is required',
            field: 'embeddingConfig.modelId'
          });
        } else {
          const embedding = getEmbeddingModelById(this.embeddingConfig.modelId);
          if (!embedding) {
            errors.push({
              code: EvaluationErrEnum.evaluatorEmbeddingModelNotFound,
              message: `Embedding model '${this.embeddingConfig.modelId}' not found or not accessible`,
              field: 'embeddingConfig.modelId'
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
          const modelId =
            modelType === ModelTypeEnum.embedding
              ? this.embeddingConfig?.modelId
              : this.llmConfig?.modelId;

          if (modelId) {
            const { totalPoints: usagePoints } = formatModelChars2Points({
              modelId,
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

  if (evaluatorConfig.runtimeConfig?.llmId) {
    try {
      const llm = getEvaluationModelById(evaluatorConfig.runtimeConfig.llmId);
      if (!llm) {
        throw new Error(`Evaluation model '${evaluatorConfig.runtimeConfig.llmId}' not found`);
      }
      const endpoint = getModelEndpointConfig(llm);
      llmConfig = {
        modelId: evaluatorConfig.runtimeConfig.llmId,
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey
      };
    } catch (err) {
      throw new Error(EvaluationErrEnum.evaluatorLLmModelNotFound);
    }
  }

  if (evaluatorConfig.runtimeConfig?.embeddingId) {
    try {
      const embedding = getEmbeddingModelById(evaluatorConfig.runtimeConfig.embeddingId);
      const endpoint = getModelEndpointConfig(embedding);
      embeddingConfig = {
        modelId: evaluatorConfig.runtimeConfig.embeddingId,
        name: endpoint.name,
        baseUrl: endpoint.baseUrl,
        apiKey: endpoint.apiKey
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
