import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn(() => ({
    model: 'gpt-4',
    name: 'GPT-4'
  }))
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({
    modelName: 'GPT-4',
    totalPoints: 0.3
  }))
}));

import { dispatchModelAgent } from '@fastgpt/service/core/workflow/dispatch/ai/agent/sub/model';

describe('dispatchModelAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns request id and usage in node response', async () => {
    createLLMResponseMock.mockResolvedValue({
      answerText: 'model answer',
      requestId: 'req_model_agent',
      usage: {
        inputTokens: 12,
        outputTokens: 4
      }
    });

    const result = await dispatchModelAgent({
      model: 'gpt-4',
      systemPrompt: 'system',
      task: 'task',
      onReasoning: vi.fn(),
      onStreaming: vi.fn()
    });

    expect(createLLMResponseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        throwError: false
      })
    );
    expect(result.usages).toEqual([
      {
        moduleName: 'GPT-4',
        model: 'gpt-4',
        totalPoints: 0.3,
        inputTokens: 12,
        outputTokens: 4
      }
    ]);
    expect(result.nodeResponse).toEqual({
      moduleType: FlowNodeTypeEnum.agent,
      moduleName: 'GPT-4',
      model: 'gpt-4',
      llmRequestIds: ['req_model_agent'],
      inputTokens: 12,
      outputTokens: 4,
      totalPoints: 0.3,
      textOutput: 'model answer'
    });
  });
});
