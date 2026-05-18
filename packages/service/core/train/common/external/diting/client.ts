import axios from 'axios';
import type {
  DiTingSyntheticEvalDataRequest,
  DiTingSyntheticEvalDataResponse,
  DiTingLLMJudgeRequest,
  DiTingLLMJudgeResponse
} from './types';
import { addLog } from '../../../../../common/system/log';
import { trainEnv } from '../../env';

function getDiTingConfig() {
  return {
    url: trainEnv.DITING_BASE_URL,
    timeout: trainEnv.DITING_TIMEOUT
  };
}

function getDiTingEndpoint(): string {
  return getDiTingConfig().url;
}

function getDiTingTimeout(): number {
  return getDiTingConfig().timeout;
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
export async function synthesizeEvalData(
  request: DiTingSyntheticEvalDataRequest
): Promise<DiTingSyntheticEvalDataResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/dataset-synthesis/runs`;

  addLog.debug('DiTing synthesize eval data', {
    url,
    synthesizerName: request.synthesizerConfig.synthesizerName,
    contextLength: request.inputData.context.length,
    numCases: request.inputData.numCases,
    llmModel: request.llm_config.modelId
  });

  try {
    const response = await axios.post(url, request, {
      timeout: request.llm_config.timeout ? request.llm_config.timeout * 1000 : getDiTingTimeout(),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const apiResponse = response.data;

    if (
      apiResponse.status !== 'success' ||
      !apiResponse.data?.qaPairs ||
      !Array.isArray(apiResponse.data.qaPairs) ||
      apiResponse.data.qaPairs.length === 0
    ) {
      throw new Error('Invalid response from DiTing API');
    }

    addLog.debug('DiTing synthesize eval data completed', {
      requestId: apiResponse.requestId,
      question: apiResponse.data.qaPairs[0]?.question?.substring(0, 50),
      qaPairsCount: apiResponse.data.qaPairs.length
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
 * Call DiTing LLM judge API to determine which chunks are truly relevant to a query
 *
 * @param request - Contains question, retrieval_reference_list, and llm_config
 * @returns Detected relevant data IDs as determined by the LLM judge
 */
export async function callLLMJudge(
  request: DiTingLLMJudgeRequest
): Promise<DiTingLLMJudgeResponse> {
  const endpoint = getDiTingEndpoint();
  const url = `${endpoint}/api/v1/dataset-synthesis/detect-context`;

  addLog.debug('DiTing LLM judge request', {
    url,
    question: request.question?.substring(0, 50),
    referenceCount: request.retrieval_reference_list.length,
    llmModel: request.llm_config.name
  });

  try {
    const response = await axios.post(url, request, {
      timeout: getDiTingTimeout(),
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const apiResponse = response.data;

    if (apiResponse.status !== 'success') {
      throw new Error(apiResponse.error || 'Invalid response from DiTing detect-context API');
    }

    addLog.debug('DiTing LLM judge completed', {
      detectedCount: apiResponse.detected_data_ids?.length ?? 0,
      totalReferences: request.retrieval_reference_list.length
    });

    return {
      status: apiResponse.status,
      detected_data_ids: apiResponse.detected_data_ids ?? []
    };
  } catch (error) {
    addLog.error('DiTing LLM judge failed', {
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}
