import type { EmbeddingEvalResult } from '@fastgpt/global/core/train/embedding/type';

/** DiTing synthesize training data request (plural) */
export type DiTingSyntheticEmbeddingTrainDatasRequest = {
  samples: Array<{
    datasetId: string;
    dataId: string;
    q: string;
    a: string;
    indexes: string[][];
  }>;
  config: {
    minNegativeSamples?: number;
    maxNegativeSamples?: number;
    includeOriginalQ?: boolean;
  };
};

/** DiTing synthesize training data response (plural) */
export type DiTingSyntheticEmbeddingTrainDatasResponse = {
  success: boolean;
  data: DiTingSyntheticEmbeddingTrainDataItem[];
  error?: string;
};

/** DiTing synthetic training data item */
export type DiTingSyntheticEmbeddingTrainDataItem = {
  query: string;
  positive: string[];
  negatives: string[];
  sourceId: string;
  datasetId: string;
  originalQ?: string;
  originalA?: string;
  metadata?: {
    pair_index: number;
    source_type: string;
    negative_count: number;
  };
};

/** DiTing generate single evaluation data request */
export type DiTingSyntheticEmbeddingEvalDataRequest = {
  synthesizerConfig: {
    synthesizerName: string;
  };
  inputData: {
    context: string[];
  };
  llm_config: {
    name: string;
    timeout?: number;
  };
};

/** DiTing generate single evaluation data response */
export type DiTingSyntheticEmbeddingEvalDataResponse = {
  success: boolean;
  requestId?: string;
  status?: string;
  data?: {
    qaPair: {
      question: string;
      answer: string;
    };
    metadata?: {
      synthesizer: string;
    };
  };
  usages?: Array<{
    modelType: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
  error?: string;
};

/** DiTing evaluate embedding request */
export type DiTingEvaluateEmbeddingRequest = {
  dataset: Array<{
    q: string;
    expected_dataid: string[];
  }>;
  embedding_config: {
    name: string;
    base_url?: string;
    api_key?: string;
    parameters?: Record<string, any>;
    timeout?: number;
  };
  metric_config?: {
    metric_name: string;
    k_values?: number[];
    prefixes?: string[];
  };
};

/** DiTing evaluate embedding response */
export type DiTingEvaluateEmbeddingResponse = {
  success: boolean;
  requestId?: string;
  status?: string;
  data?: {
    metricName: string;
    score: number;
    reason: string;
    runLogs: EmbeddingEvalResult;
  };
  usages?: Array<{
    modelType: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number;
  }>;
  error?: string;
};
