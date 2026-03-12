import axios from 'axios';
import type {
  DiTingSyntheticRerankTrainDatasRequest,
  DiTingSyntheticRerankTrainDatasResponse,
  DiTingSyntheticRerankTrainDataItem,
  DiTingSyntheticRerankEvalDataRequest,
  DiTingSyntheticRerankEvalDataResponse,
  DiTingEvaluateRerankRequest,
  DiTingEvaluateRerankResponse
} from './types';
import { addLog } from '../../../../../common/system/log';
import { DEFAULT_DITING_TIMEOUT } from '../../constants';

/**
 * DiTing service real client for training data generation and evaluation
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
 * Generate rerank training data (batch)
 * Calls DiTing's build-fine-tune-data endpoint
 *
 * @param request - Contains samples and configuration for data generation
 * @returns Generated training data samples
 */
export async function synthesizeRerankTrainDatas(
  request: DiTingSyntheticRerankTrainDatasRequest
): Promise<DiTingSyntheticRerankTrainDatasResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/dataset-synthesis/build-fine-tune-data`;

  addLog.info('DiTing synthesize rerank train datas', {
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
      (sample: DiTingSyntheticRerankTrainDataItem) => ({
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

    addLog.info('DiTing synthesize rerank train datas completed', {
      totalItems: apiResponse.totalItems,
      totalSamples: apiResponse.totalSamples
    });

    return {
      success: true,
      data: transformedData
    };
  } catch (error) {
    addLog.error('DiTing synthesize rerank train datas failed', {
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
export async function synthesizeRerankEvalData(
  request: DiTingSyntheticRerankEvalDataRequest
): Promise<DiTingSyntheticRerankEvalDataResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/dataset-synthesis/runs`;

  addLog.info('DiTing synthesize eval data', {
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

    addLog.info('DiTing synthesize eval data completed', {
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
 * Evaluate rerank model
 * Calls DiTing's evaluations/rerank endpoint
 *
 * Responsibility: Only handles DiTing API call and returns raw response
 * Business logic (querying dataset, getting model config, etc.) is handled by caller
 *
 * @param request - Contains dataset, reranker config, and metric config
 * @returns Evaluation metrics and detailed results
 */
export async function evaluateRerankModel(
  request: DiTingEvaluateRerankRequest
): Promise<DiTingEvaluateRerankResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/evaluations/rerank`;

  addLog.info('DiTing evaluate rerank model', {
    url,
    datasetSize: request.dataset.length,
    rerankModel: request.reranker_config.name
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

    addLog.info('DiTing evaluate rerank model completed', {
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
    addLog.error('DiTing evaluate rerank model failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
