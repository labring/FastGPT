import type { EvaluationStatusEnum, CalculateMethodEnum, SummaryStatusEnum } from './constants';
import type { EvalDatasetDataKeyEnum } from './dataset/constants';
import type { EvalDatasetDataSchemaType } from './dataset/type';
import type { MetricResult, EvalMetricSchemaType } from './metric/type';
import type { EvaluationPermission } from '../../support/permission/evaluation/controller';
import type { SourceMemberType } from '../../support/user/type';

// Evaluation target related types
export interface WorkflowConfig {
  appId: string;
  versionId: string; // Required app version ID
  chatConfig?: any;
  // Extended fields populated by aggregation queries
  appName?: string; // App name from apps collection
  avatar?: string; // App avatar from apps collection
  versionName?: string; // Version name from app_versions collection
}

export interface EvalTarget {
  type: 'workflow';
  config: WorkflowConfig;
}

export interface RuntimeConfig {
  llm?: string; // LLM model selection
  embedding?: string; // Embedding model selection
}

// Summary configuration type
export interface SummaryConfig {
  metricId: string;
  metricName: string;
  weight: number;
  summary: string;
  summaryStatus: SummaryStatusEnum;
  errorReason: string;
}

export type UpdateStatusParams = {
  evalId: string;
  metricId: string;
  status: SummaryStatusEnum;
  errorReason?: string;
};

// SummaryData type containing calculation method and configs
export interface SummaryData {
  calculateType: CalculateMethodEnum; // Calculation method for all metrics
  summaryConfigs: SummaryConfig[]; // Array of summary configs, one for each metric
}

// Evaluator configuration type
export interface EvaluatorSchema {
  metric: EvalMetricSchemaType; // Contains complete metric configuration
  runtimeConfig: RuntimeConfig; // Runtime configuration including LLM model
  thresholdValue?: number;
  scoreScaling?: number; // Score scaling factor, default is 1
}

// Statistics information for evaluation task
export interface EvaluationStatistics {
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
}

// Improved evaluation task types
export type EvaluationSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  evalDatasetCollectionId: string; // Associated evaluation dataset collection
  target: EvalTarget; // Embedded evaluation target
  evaluators: EvaluatorSchema[]; // Array of evaluator configurations
  summaryData: SummaryData; // Summary configuration containing calculateType and summaryConfigs
  usageId: string;
  status: EvaluationStatusEnum;
  createTime: Date;
  finishTime?: Date;
  errorMessage?: string;
  statistics?: EvaluationStatistics;
};

/**
 * Target call parameters for evaluation execution extensibility.
 * Provides structured way to pass variables and additional configuration
 * to target instances during evaluation.
 *
 * @example
 * ```typescript
 * const params: TargetCallParams = {
 *   variables: { userId: "123", theme: "dark" },  // Named variables for target execution
 *   timeout: 5000,                               // Custom timeout setting
 *   retryCount: 3,                               // Retry configuration
 *   customHeaders: { "X-Custom": "value" }       // Additional parameters
 * }
 * ```
 */
export interface TargetCallParams {
  /** Named variables to be passed to target execution (replaces globalVariables) */
  variables?: Record<string, any>;
  /** Index signature allowing additional extensible parameters */
  [key: string]: any;
}

/**
 * Evaluation data item that contains only the necessary fields for evaluation execution.
 * Used in evaluation context where both dataset content and execution parameters are needed.
 */
export type EvaluationDataItemType = Pick<
  EvalDatasetDataSchemaType,
  | '_id'
  | EvalDatasetDataKeyEnum.UserInput
  | EvalDatasetDataKeyEnum.ExpectedOutput
  | EvalDatasetDataKeyEnum.Context
> & {
  targetCallParams?: TargetCallParams;
};

// Evaluation item type (batch: one dataItem + one target + multiple evaluators)
export type EvaluationItemSchemaType = {
  _id: string;
  evalId: string;
  // Dependent component configurations
  dataItem: EvaluationDataItemType;
  // Execution results
  targetOutput?: TargetOutput; // Actual output from target
  evaluatorOutputs?: MetricResult[]; // Results from multiple evaluators
  status: EvaluationStatusEnum;
  finishTime?: Date;
  errorMessage?: string;
};

// Evaluation target input/output types
export interface TargetInput {
  [EvalDatasetDataKeyEnum.UserInput]: string;
  [EvalDatasetDataKeyEnum.Context]?: string[];
  targetCallParams?: TargetCallParams;
}

export interface TargetOutput {
  [EvalDatasetDataKeyEnum.ActualOutput]: string;
  [EvalDatasetDataKeyEnum.RetrievalContext]?: string[];
  usage?: any;
  responseTime: number;
  chatId: string;
  aiChatItemDataId: string;
}

export type EvaluationWithPerType = EvaluationSchemaType & {
  permission: EvaluationPermission;
};

// ===== Display Types =====

// Extended SummaryConfig for display purposes (includes runtime calculated fields)
export interface SummaryConfigDisplay extends SummaryConfig {
  score: number; // Real-time calculated metric score
  completedItemCount: number; // Real-time calculated completed items count
  overThresholdItemCount: number; // Real-time calculated over threshold items count
}

export type EvaluationDisplayType = Omit<EvaluationWithPerType, 'summaryData'> & {
  evalDatasetCollectionName?: string;
  metricNames: string[];
  private: boolean;
  sourceMember: SourceMemberType;
  summaryData: Omit<SummaryData, 'summaryConfigs'> & {
    summaryConfigs: SummaryConfigDisplay[]; // Use extended version for display
  };
  aggregateScore?: number; // Real-time calculated aggregate score
};

export type EvaluationItemDisplayType = EvaluationItemSchemaType & {
  evaluators: Array<{
    metric: EvalMetricSchemaType; // Contains complete metric configuration
    thresholdValue?: number; // Threshold value for this evaluator
    weight?: number;
  }>; // Array of evaluator configurations
};

export interface CreateEvaluationParams {
  name: string;
  description?: string;
  evalDatasetCollectionId: string;
  target: EvalTarget; // Only supports workflow type target configuration
  evaluators: EvaluatorSchema[]; // Replace metricIds with evaluators
  autoStart?: boolean; // Whether to automatically start the evaluation task after creation (default: true)
}

type EvaluationParamsType = Omit<CreateEvaluationParams, 'autoStart'>;

type EvaluationParamsWithDeafultConfigType = Omit<CreateEvaluationParams, 'autoStart'> & {
  summaryData: {
    calculateType: CalculateMethodEnum;
    summaryConfigs: SummaryConfig[];
  };
};

// Queue job data types
export interface EvaluationTaskJobData {
  evalId: string;
}

export interface EvaluationItemJobData {
  evalId: string;
  evalItemId: string;
}

// ===== Summary Generate API Types =====

export interface GenerateSummaryParams {
  evalId: string;
  metricIds: string[];
}

export interface GenerateSummaryResponse {
  success: boolean;
  message: string;
}

export interface SummaryGenerationTaskData {
  evalId: string;
  metricId: string;
  evaluatorIndex: number;
}
