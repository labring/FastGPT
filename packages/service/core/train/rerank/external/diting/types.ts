import type { RerankEvalResult } from '@fastgpt/global/core/train/rerank/type';

/** DiTing synthesize training data request (plural) */
export type DiTingSyntheticRerankTrainDatasRequest = {
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
export type DiTingSyntheticRerankTrainDatasResponse = {
  success: boolean;
  data: DiTingSyntheticRerankTrainDataItem[];
  error?: string;
};

/** DiTing synthetic training data item */
export type DiTingSyntheticRerankTrainDataItem = {
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
export type DiTingSyntheticRerankEvalDataRequest = {
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
export type DiTingSyntheticRerankEvalDataResponse = {
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

/** DiTing evaluate rerank request */
export type DiTingEvaluateRerankRequest = {
  dataset: Array<{
    q: string;
    retrieval_reference_list: Array<{
      id: string;
      q: string;
      a: string;
      score: Array<{
        type: string;
        value: number;
        index: number;
      }>;
    }>;
    expected_dataid: string[];
  }>;
  reranker_config: {
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

/** DiTing evaluate rerank response */
export type DiTingEvaluateRerankResponse = {
  success: boolean;
  requestId?: string;
  status?: string;
  data?: {
    metricName: string;
    score: number;
    reason: string;
    runLogs: RerankEvalResult;
  };
  usages?: Array<{
    modelType: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number;
  }>;
  error?: string;
};
