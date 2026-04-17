import type { DiTingSyntheticEvalDataRequest, DiTingSyntheticEvalDataResponse } from './types';
import { addLog } from '../../../../../common/system/log';

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
  addLog.debug('[MOCK] DiTing synthesize eval data', {
    synthesizerName: request.synthesizerConfig.synthesizerName,
    contextLength: request.inputData.context.length,
    llmModel: request.llm_config.name
  });

  await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

  if (process.env.MOCK_DITING_SYNTH_FAIL === 'true') {
    addLog.debug(
      '[MOCK] DiTing synthesize eval data - injecting failure via MOCK_DITING_SYNTH_FAIL'
    );
    return {
      success: false,
      requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status: 'failed',
      error: 'Mock failure injected via MOCK_DITING_SYNTH_FAIL'
    };
  }

  const contextText = request.inputData.context.join('\n');
  const question = `Question based on: ${contextText.slice(0, 50)}...`;
  const answer = `Answer based on context: ${contextText.slice(0, 100)}...`;

  return {
    success: true,
    requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    status: 'success',
    data: {
      qaPair: {
        question,
        answer
      },
      metadata: {
        synthesizer: request.synthesizerConfig.synthesizerName
      }
    },
    usages: [
      {
        modelType: request.llm_config.name,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      }
    ]
  };
}
