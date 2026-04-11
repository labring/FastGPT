import axios from 'axios';
import type {
  DiTingSyntheticEmbeddingTrainDatasRequest,
  DiTingSyntheticEmbeddingTrainDatasResponse,
  DiTingSyntheticEmbeddingTrainDataItem,
  DiTingSyntheticEmbeddingEvalDataRequest,
  DiTingSyntheticEmbeddingEvalDataResponse,
  DiTingEvaluateEmbeddingRequest,
  DiTingEvaluateEmbeddingResponse
} from './types';
import { addLog } from '../../../../../common/system/log';
import { DEFAULT_DITING_TIMEOUT } from '../../constants';

/**
 * DiTing service real client for embedding training data generation and evaluation
 */

function getDiTingConfig() {
  return {
    url: process.env.DITING_BASE_URL || 'http://diting:3000',
    timeout: Number(process.env.DITING_TIMEOUT) || DEFAULT_DITING_TIMEOUT
  };
}

function getDiTingEndpoint(): string {
  return getDiTingConfig().url;
}

function getDiTingTimeout(): number {
  return getDiTingConfig().timeout;
}

/**
 * Generate embedding training data (batch)
 * Calls DiTing's build-fine-tune-data endpoint
 *
 * @param request - Contains samples and configuration for data generation
 * @returns Generated training data samples
 */
export async function synthesizeEmbeddingTrainDatas(
  request: DiTingSyntheticEmbeddingTrainDatasRequest
): Promise<DiTingSyntheticEmbeddingTrainDatasResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/dataset-synthesis/build-fine-tune-data`;

  addLog.debug('DiTing synthesize embedding train datas', {
    url,
    sampleCount: request.samples.length,
    config: request.config
  });

  try {
    const apiRequest = {
      items: request.samples.map((sample) => ({
        dataId: sample.dataId,
        datasetId: sample.datasetId,
        q: sample.q,
        a: sample.a,
        indexes: sample.indexes
      })),
      min_negative_samples: request.config.minNegativeSamples ?? 1,
      max_negative_samples: request.config.maxNegativeSamples ?? 5,
      include_original_q: request.config.includeOriginalQ ?? true
    };

    const response = await axios.post(url, apiRequest, {
      timeout: getDiTingTimeout(),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const apiResponse = response.data;

    if (!apiResponse.samples || !Array.isArray(apiResponse.samples)) {
      throw new Error('Invalid response from DiTing API');
    }

    const transformedData = apiResponse.samples.map(
      (sample: DiTingSyntheticEmbeddingTrainDataItem) => ({
        query: sample.query,
        positive: sample.positive || [],
        negatives: sample.negatives || [],
        sourceId: sample.sourceId,
        datasetId: sample.datasetId,
        originalQ: sample.originalQ,
        originalA: sample.originalA,
        metadata: sample.metadata
      })
    );

    addLog.debug('DiTing synthesize embedding train datas completed', {
      totalItems: apiResponse.totalItems,
      totalSamples: apiResponse.totalSamples
    });

    return {
      success: true,
      data: transformedData
    };
  } catch (error) {
    addLog.error('DiTing synthesize embedding train datas failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      data: [],
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Synthesize single evaluation data (QA pair)
 * Calls DiTing's dataset-synthesis/runs endpoint
 *
 * Responsibility: Only handles DiTing API call and returns raw response
 * Business logic (data sampling, dataset creation, etc.) is handled by caller
 *
 * @param request - Contains synthesizer config, input data, and LLM config
 * @returns Generated QA pair and metadata
 */
export async function synthesizeEmbeddingEvalData(
  request: DiTingSyntheticEmbeddingEvalDataRequest
): Promise<DiTingSyntheticEmbeddingEvalDataResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/dataset-synthesis/runs`;

  addLog.debug('DiTing synthesize eval data', {
    url,
    synthesizerName: request.synthesizerConfig.synthesizerName,
    contextLength: request.inputData.context.length,
    llmModel: request.llm_config.name
  });

  try {
    const response = await axios.post(url, request, {
      timeout: request.llm_config.timeout ? request.llm_config.timeout * 1000 : getDiTingTimeout(),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const apiResponse = response.data;

    if (apiResponse.status !== 'success' || !apiResponse.data?.qaPair) {
      throw new Error('Invalid response from DiTing API');
    }

    addLog.debug('DiTing synthesize eval data completed', {
      requestId: apiResponse.requestId,
      question: apiResponse.data.qaPair.question?.substring(0, 50)
    });

    return {
      success: true,
      requestId: apiResponse.requestId,
      status: apiResponse.status,
      data: apiResponse.data,
      usages: apiResponse.usages
    };
  } catch (error) {
    addLog.error('DiTing synthesize eval data failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Evaluate embedding model
 * Calls DiTing's evaluations/embed endpoint
 *
 * Key difference from rerank: no retrieval_reference_list, uses expected_dataid directly
 *
 * Responsibility: Only handles DiTing API call and returns raw response
 * Business logic (querying dataset, getting model config, etc.) is handled by caller
 *
 * @param request - Contains embedding model config, expected_dataid, and dataset
 * @returns Evaluation metrics and detailed results
 */
export async function evaluateEmbeddingModel(
  request: DiTingEvaluateEmbeddingRequest
): Promise<DiTingEvaluateEmbeddingResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/evaluations/embed`;

  addLog.debug('DiTing evaluate embedding model', {
    url,
    datasetSize: request.dataset.length,
    embeddingModel: request.embedding_config.name
  });

  try {
    const response = await axios.post(url, request, {
      timeout: getDiTingTimeout(),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const apiResponse = response.data;

    if (apiResponse.status !== 'success' || !apiResponse.data?.runLogs?.detailed_results) {
      throw new Error('Invalid response from DiTing API');
    }

    addLog.debug('DiTing evaluate embedding model completed', {
      requestId: apiResponse.requestId,
      score: apiResponse.data.score,
      metricName: apiResponse.data.metricName
    });

    return {
      success: true,
      requestId: apiResponse.requestId,
      status: apiResponse.status,
      data: apiResponse.data,
      usages: apiResponse.usages
    };
  } catch (error) {
    addLog.error('DiTing evaluate embedding model failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
