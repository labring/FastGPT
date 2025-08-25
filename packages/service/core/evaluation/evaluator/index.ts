import type {
  EvalCase,
  MetricResult,
  AiModelConfig,
  EvaluatorSchema
} from '@fastgpt/global/core/evaluation/type';
import { getAppEvaluationScore } from './scoring';

// 评估器基类
export abstract class Evaluator {
  protected config: any;
  protected metricId: string;
  protected name: string;
  protected runtimeConfig: any;

  constructor(evaluatorConfig: EvaluatorSchema) {
    this.config = evaluatorConfig.metric.config;
    this.metricId = evaluatorConfig.metric._id;
    this.name = evaluatorConfig.metric.name;
    this.runtimeConfig = evaluatorConfig.runtimeConfig;
  }

  abstract evaluate(evalCase: EvalCase): Promise<MetricResult>;
  abstract getName(): string;
  abstract validate(): Promise<boolean>;
}

// AI 模型评估器实现
export class AiModelEvaluator extends Evaluator {
  protected config: AiModelConfig;
  protected runtimeConfig: { llm?: string };

  constructor(evaluatorConfig: EvaluatorSchema) {
    super(evaluatorConfig);
    this.config = evaluatorConfig.metric.config as AiModelConfig;
    this.runtimeConfig = evaluatorConfig.runtimeConfig;
  }

  async evaluate(evalCase: EvalCase): Promise<MetricResult> {
    try {
      // 使用运行时配置的模型，如果没有则使用配置中的模型
      const modelToUse = this.runtimeConfig.llm || this.config.llm;

      if (!modelToUse) {
        throw new Error('No LLM model specified in runtime config or metric config');
      }

      // 使用现有的 AI 评估功能
      const { score, usage } = await getAppEvaluationScore({
        userInput: evalCase.userInput || '',
        appAnswer: evalCase.actualOutput || '',
        standardAnswer: evalCase.expectedOutput || '',
        model: modelToUse,
        prompt: this.config.prompt
      });

      return {
        metricId: this.metricId,
        metricName: this.name,
        score,
        details: {
          usage,
          model: modelToUse,
          prompt: this.config.prompt
        }
      };
    } catch (error) {
      return {
        metricId: this.metricId,
        metricName: this.name,
        score: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getName(): string {
    return this.name;
  }

  async validate(): Promise<boolean> {
    try {
      // 检查是否有可用的模型配置
      const hasModel = this.runtimeConfig.llm || this.config.llm;
      return Boolean(hasModel);
    } catch (error) {
      return false;
    }
  }
}

// 评估器工厂 - 当前仅支持ai_model类型
export function createEvaluatorInstance(evaluatorConfig: EvaluatorSchema): Evaluator {
  switch (evaluatorConfig.metric.type) {
    case 'ai_model':
      return new AiModelEvaluator(evaluatorConfig);
    default:
      throw new Error(
        `Unsupported metric type: ${evaluatorConfig.metric.type}. Only 'ai_model' is currently supported.`
      );
  }
}
