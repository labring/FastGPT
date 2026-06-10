import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLLMResponseMock, getLLMModelMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  getLLMModelMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: getLLMModelMock
}));

import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';

describe('createQuestionGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLLMResponseMock.mockResolvedValue({
      answerText: '["问题 1","问题 2","问题 3"]',
      usage: {
        inputTokens: 10,
        outputTokens: 5
      }
    });
  });

  it('forces reasoning models to disable reasoning for question guide generation', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'deepseek-r1',
      reasoning: true
    });

    await createQuestionGuide({
      messages: [],
      model: 'deepseek-r1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      model: 'deepseek-r1',
      reasoning_effort: 'none'
    });
  });

  it('does not set reasoning effort for non-reasoning models', async () => {
    getLLMModelMock.mockReturnValue({
      model: 'gpt-4o',
      reasoning: false
    });

    await createQuestionGuide({
      messages: [],
      model: 'gpt-4o'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
  });
});
