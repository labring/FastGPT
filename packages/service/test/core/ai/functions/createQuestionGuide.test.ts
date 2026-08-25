import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createLLMResponseMock, getLLMModelMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  getLLMModelMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model/cache', () => ({
  getLLMModel: getLLMModelMock,
  // Tests drive valid model data via getLLMModelMock; pass the guard through.
  assertModelUsable: (model: unknown) => model
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
      id: 'deepseek-r1',
      model: 'deepseek-r1',
      reasoning: true
    });

    await createQuestionGuide({
      messages: [],
      modelId: 'deepseek-r1',
      teamId: 'team_1'
    });

    // design §2.10 revision: wire body no longer carries `model` — it is
    // resolved from modelData by createLLMResponse; modelData must be passed.
    expect(createLLMResponseMock.mock.calls[0][0].modelData).toMatchObject({
      model: 'deepseek-r1'
    });
    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      reasoning_effort: 'none'
    });
  });

  it('does not set reasoning effort for non-reasoning models', async () => {
    getLLMModelMock.mockReturnValue({
      id: 'gpt-4o',
      model: 'gpt-4o',
      reasoning: false
    });

    await createQuestionGuide({
      messages: [],
      modelId: 'gpt-4o',
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
  });
});
