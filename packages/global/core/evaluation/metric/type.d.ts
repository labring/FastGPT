import type { EvalDatasetDataKeyEnum } from '../dataset/constants';
import type { ModelTypeEnum, EvalMetricTypeEnum, MetricResultStatusEnum } from './constants';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';

export type EvalModelConfigType = {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  timeout?: number;
  parameters?: Record<string, any>;
};

export type EvalCase = {
  [EvalDatasetDataKeyEnum.UserInput]?: string;
  [EvalDatasetDataKeyEnum.ExpectedOutput]?: string;
  [EvalDatasetDataKeyEnum.ActualOutput]?: string;
  [EvalDatasetDataKeyEnum.Context]?: string[];
  [EvalDatasetDataKeyEnum.RetrievalContext]?: string[];
};

export type MetricResult = {
  metricName: string;
  status: MetricResultStatusEnum;
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
  totalPoints?: number;
};

export type EvalMetricSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  type: EvalMetricTypeEnum;
  prompt?: string;

  userInputRequired?: boolean;
  actualOutputRequired?: boolean;
  expectedOutputRequired?: boolean;
  contextRequired?: boolean;
  retrievalContextRequired?: boolean;

  embeddingRequired?: boolean;
  llmRequired?: boolean;

  createTime: Date;
  updateTime: Date;
};

export interface EvalMetricDisplayType extends EvalMetricSchemaType {
  sourceMember: SourceMemberType;
}

export type HttpConfig = {
  url: string;
  timeout?: number;
};

export type MetricConfig = {
  metricName: string;
  metricType: EvalMetricTypeEnum;
  prompt?: string;
};

export type EvaluationRequest = {
  evalCase: EvalCase;
  metricConfig: MetricConfig;
  embeddingConfig?: EvalModelConfigType | null;
  llmConfig?: EvalModelConfigType | null;
};

export type EvaluationResult = {
  metricName: string;
  score: number;
  reason?: string;
  runLogs?: Record<string, any>;
};

export type Usage = {
  modelType: ModelTypeEnum;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type EvaluationResponse = {
  status: MetricResultStatusEnum;
  data?: EvaluationResult;
  usages?: Usage[];
  error?: string;
};

export type MetricDefinition = {
  name: string;
  description: string;
  requireQuestion: boolean;
  requireActualResponse: boolean;
  requireExpectedResponse: boolean;
  requireContext: boolean;
  requireRetrievalContext: boolean;
};

export type SynthesisCase = {
  context?: string[];
  themes?: string[];
};

export type SynthesisOutput = {
  qaPair: {
    question: string;
    answer: string;
  };
  metadata?: Record<string, any>;
};

export type SynthesisResult = {
  synthesisName: string;
  status: string;
  data?: SynthesisOutput;
  usages?: Usage[];
  error?: string;
  totalPoints?: number;
};

export type SynthesizerConfig = {
  synthesizerName: string;
  config?: Record<string, any>;
};

export type SynthesisRequest = {
  synthesisCase: SynthesisCase;
  synthesizerConfig: SynthesizerConfig;
  llmConfig?: EvalModelConfigType;
  embeddingConfig?: EvalModelConfigType;
};

export type SynthesisResponse = {
  requestId: string;
  status: string;
  data?: SynthesisOutput;
  usages?: Usage[];
  error?: string;
  metadata?: Record<string, any>;
};

export type SynthesisMetadata = {
  chunkId?: string;
  totalChunks?: number;
  projectName?: string;
  createdAt?: string;
};

export type DatasetSynthesisRequest = {
  metadata?: SynthesisMetadata;
  llmConfig: EvalModelConfigType;
  embeddingConfig?: EvalModelConfigType;
  synthesizerConfig: SynthesizerConfig;
  inputData: {
    context?: string[];
    themes?: string[];
  };
};

export type DatasetSynthesisResponse = {
  requestId: string;
  status: string;
  data?: {
    qaPair: {
      question: string;
      answer: string;
    };
    metadata?: Record<string, any>;
  };
  usages?: Usage[];
  error?: string;
  metadata?: Record<string, any>;
};
