import type {
  DiTingSyntheticEmbeddingTrainDatasRequest,
  DiTingSyntheticEmbeddingTrainDatasResponse,
  DiTingSyntheticEmbeddingEvalDataRequest,
  DiTingSyntheticEmbeddingEvalDataResponse,
  DiTingEvaluateEmbeddingRequest,
  DiTingEvaluateEmbeddingResponse
} from './types';

/**
 * Mock DiTing service client for testing embedding operations
 */

export async function synthesizeEmbeddingTrainDatas(
  request: DiTingSyntheticEmbeddingTrainDatasRequest
): Promise<DiTingSyntheticEmbeddingTrainDatasResponse> {
  return {
    success: true,
    data: request.samples.map((sample) => ({
      query: `mock_query_for_${sample.dataId}`,
      positive: [`${sample.dataId}_positive`],
      negatives: [`${sample.dataId}_negative1`, `${sample.dataId}_negative2`],
      sourceId: sample.dataId,
      datasetId: sample.datasetId
    }))
  };
}

export async function synthesizeEmbeddingEvalData(
  request: DiTingSyntheticEmbeddingEvalDataRequest
): Promise<DiTingSyntheticEmbeddingEvalDataResponse> {
  return {
    success: true,
    requestId: 'mock_request_id',
    status: 'success',
    data: {
      qaPair: {
        question: 'mock question',
        answer: 'mock answer'
      },
      metadata: {
        synthesizer: request.synthesizerConfig.synthesizerName
      }
    }
  };
}

export async function evaluateEmbeddingModel(
  request: DiTingEvaluateEmbeddingRequest
): Promise<DiTingEvaluateEmbeddingResponse> {
  return {
    success: true,
    requestId: 'mock_request_id',
    status: 'success',
    data: {
      metricName: 'MRR',
      score: 0.85,
      reason: 'mock evaluation result',
      runLogs: {
        detailed_results: {
          embed_top5_mrr: 0.8,
          embed_top5_precision: 0.75,
          embed_top10_mrr: 0.7,
          embed_top10_precision: 0.65
        }
      }
    }
  };
}
