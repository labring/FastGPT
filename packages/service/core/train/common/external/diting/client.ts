import axios from 'axios';
import type { DiTingSyntheticEvalDataRequest, DiTingSyntheticEvalDataResponse } from './types';
import { addLog } from '../../../../../common/system/log';
import { DEFAULT_DITING_TIMEOUT } from '../../constants';

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
