import type { EvaluationStatusEnum } from './constants';
import type { EvalDatasetDataSchemaType } from './dataset/type';
import type { MetricResult } from './metric/type';

// Evaluation target related types
export interface WorkflowConfig {
  appId: string;
  chatConfig?: any;
}

export interface EvalTarget {
  type: 'workflow';
  config: WorkflowConfig;
}

// Statistics information for evaluation task
export interface EvaluationStatistics {
  totalItems: number;
  completedItems: number;
  errorItems: number;
}

// Improved evaluation task types
export type EvaluationSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  datasetId: string; // Associated dataset
  target: EvalTarget; // Embedded evaluation target
  evaluators: EvaluatorSchema[]; // Array of evaluator configurations
  usageId: string;
  status: EvaluationStatusEnum;
  createTime: Date;
  finishTime?: Date;
  avgScore?: number;
  errorMessage?: string;
  statistics?: EvaluationStatistics;
};

// Evaluation item types (atomic: one dataItem + one target + one evaluator)
export type EvaluationItemSchemaType = {
  _id: string;
  evalId: string;
  // Dependent component configurations
  dataItem: EvalDatasetDataSchemaType;
  target: EvalTarget;
  evaluator: EvaluatorSchema; // Single evaluator configuration
  // Execution results
  targetOutput?: TargetOutput; // Actual output from target
  evaluatorOutput?: MetricResult; // Result from single evaluator
  status: EvaluationStatusEnum;
  retry: number;
  finishTime?: Date;
  errorMessage?: string;
};

// Evaluation target input/output types
export interface TargetInput {
  userInput: string;
  context?: string[];
  globalVariables?: Record<string, any>;
}

export interface TargetOutput {
  actualOutput: string;
  retrievalContext?: string[];
  usage?: any;
  responseTime: number;
}

// ===== Display Types =====

export type EvaluationDisplayType = Pick<
  EvaluationSchemaType,
  'name' | 'createTime' | 'finishTime' | 'status' | 'errorMessage' | 'avgScore'
> & {
  _id: string;
  executorAvatar: string;
  executorName: string;
  datasetName: string;
  targetName: string;
  metricNames: string[];
  completedCount: number;
  errorCount: number;
  totalCount: number;
};

export type EvaluationItemDisplayType = EvaluationItemSchemaType & {
  evalItemId: string;
};

// Validation result types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Import result types
export interface ImportResult {
  success: boolean;
  importedCount: number;
  errors: string[];
}

export interface CreateEvaluationParams {
  name: string;
  description?: string;
  datasetId: string;
  target: EvalTarget; // Only supports workflow type target configuration
  evaluators: EvaluatorSchema[]; // Replace metricIds with evaluators
}

// Queue job data types
export interface EvaluationTaskJobData {
  evalId: string;
}

export interface EvaluationItemJobData {
  evalId: string;
  evalItemId: string;
}
