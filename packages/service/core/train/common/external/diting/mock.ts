import type { DiTingSyntheticEvalDataRequest, DiTingSyntheticEvalDataResponse } from './types';
import { addLog } from '../../../../../common/system/log';
import { trainEnv } from '../../env';

/**
 * Mock implementation of single evaluation data synthesis (QA pair)
 * Real implementation should call DiTing's dataset-synthesis/runs API
 *
 * @param request - Contains synthesizer config, input data, and LLM config
 * @returns Generated QA pair and metadata
 */
export async function mockSynthesizeEvalData(
  request: DiTingSyntheticEvalDataRequest
): Promise<DiTingSyntheticEvalDataResponse> {
  const numCases = request.inputData.numCases ?? 1;

  addLog.debug('[MOCK] DiTing synthesize eval data', {
    synthesizerName: request.synthesizerConfig.synthesizerName,
    contextLength: request.inputData.context.length,
    numCases,
    llmModel: request.llm_config.name
  });

  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  if (trainEnv.DITING_MOCK_SYNTH_FAIL) {
    return {
      success: false,
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status: 'failed',
      error: 'Mock synthesis failed',
      usages: []
    };
  }

  const contextText = request.inputData.context.join('\n');

  // Generate multiple QA pairs when numCases > 1 (1-to-many strategy)
  const qaPairs = Array.from({ length: numCases }, (_, i) => ({
    question: `Question ${i + 1} based on: ${contextText.slice(0, 50)}...`,
    answer: `Answer ${i + 1} based on context: ${contextText.slice(0, 100)}...`
  }));

  return {
    success: true,
    requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    status: 'success',
    data: {
      qaPairs,
      metadata: {
        synthesizer: request.synthesizerConfig.synthesizerName
      }
    },
    usages: [
      {
        modelType: request.llm_config.name,
        promptTokens: 100 * numCases,
        completionTokens: 50 * numCases,
        totalTokens: 150 * numCases
      }
    ]
  };
}
