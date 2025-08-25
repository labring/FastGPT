import type { EvaluationStatusEnum } from './constants';

// 数据集相关类型
export interface DatasetColumn {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
}

export interface DatasetItem {
  userInput: string;
  expectedOutput: string;
  context?: string[];
  globalVariables?: Record<string, any>;
  [key: string]: any; // 支持自定义字段
}

export interface EvalDatasetSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  dataFormat: 'csv' | 'json';
  columns: DatasetColumn[];
  dataItems: DatasetItem[];
  createTime: Date;
  updateTime: Date;
}

// 评估目标相关类型
export interface WorkflowConfig {
  appId: string;
  chatConfig?: any;
}

export interface EvalTarget {
  type: 'workflow';
  config: WorkflowConfig;
}

export interface AiModelConfig {
  llm?: string;
  prompt?: string;
}

type MetricDependency = 'llm' | 'embedding';

export interface EvalMetricSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  type: 'ai_model';
  dependencies: MetricDependency[];
  config: AiModelConfig;
  createTime: Date;
  updateTime: Date;
}

// 运行时配置类型
export interface RuntimeConfig {
  llm?: string; // LLM模型选择
  embedding?: string; // Embedding模型选择
}

// Evaluator配置类型
export interface EvaluatorSchema {
  metric: EvalMetricSchemaType; // 包含完整的metric配置
  runtimeConfig: RuntimeConfig; // 运行时配置，如llm模型等
}

// 改进后的评估任务类型
export type EvaluationSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  datasetId: string; // 关联数据集
  target: EvalTarget; // 嵌入式评估目标
  evaluators: EvaluatorSchema[]; // 评估器配置数组
  usageId: string;
  status: EvaluationStatusEnum;
  createTime: Date;
  finishTime?: Date;
  avgScore?: number;
  errorMessage?: string;
};

// 评估项类型（原子性：一个dataItem + 一个target + 一个evaluator）
export type EvalItemSchemaType = {
  _id: string;
  evalId: string;
  // 依赖的组件配置
  dataItem: DatasetItem;
  target: EvalTarget;
  evaluator: EvaluatorSchema; // 单个评估器配置
  // 运行结果
  target_output?: TargetOutput; // target的实际输出
  evaluator_output?: MetricResult; // 单个评估器的结果
  status: EvaluationStatusEnum;
  retry: number;
  finishTime?: Date;
  errorMessage?: string;
};

// 指标结果类型
export interface MetricResult {
  metricId: string;
  metricName: string;
  score: number;
  details?: Record<string, any>;
  error?: string;
}

// 评估用例类型
export interface EvalCase {
  userInput?: string;
  expectedOutput?: string;
  actualOutput?: string;
  context?: string[];
  retrievalContext?: string[];
}

// 评估目标输入输出类型
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

export type EvaluationItemDisplayType = EvalItemSchemaType & {
  evalItemId: string;
};

// 验证结果类型
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// 导入结果类型
export interface ImportResult {
  success: boolean;
  importedCount: number;
  errors: string[];
}

// ===== API Parameter Types =====

export interface CreateDatasetParams {
  name: string;
  description?: string;
  dataFormat: 'csv' | 'json';
  columns: DatasetColumn[];
}

export interface UpdateDatasetParams {
  name?: string;
  description?: string;
  columns?: DatasetColumn[];
}

export interface CreateMetricParams {
  name: string;
  description?: string;
  type: 'ai_model';
  dependencies?: MetricDependency[]; // 添加依赖声明
  config?: AiModelConfig; // 改为可选
}

export interface CreateEvaluationParams {
  name: string;
  description?: string;
  datasetId: string;
  target: EvalTarget; // 仅支持workflow类型的target配置
  evaluators: EvaluatorSchema[]; // 替换metricIds为evaluators
}

// 队列作业数据类型
export interface EvaluationTaskJobData {
  evalId: string;
}

export interface EvaluationItemJobData {
  evalId: string;
  evalItemId: string;
}
