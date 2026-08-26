import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';

describe('createQuestionGuide', () => {
  const buildModel = (reasoning: boolean): LLMSystemModelDataType => ({
    modelId: '507f1f77bcf86cd799439013',
    provider: 'openai',
    model: reasoning ? 'deepseek-r1' : 'gpt-4o',
    name: reasoning ? 'DeepSeek R1' : 'GPT-4o',
    type: ModelTypeEnum.llm,
    isSystem: true,
    isActive: true,
    isCustom: false,
    config: {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 30000,
      reasoning
    }
  });

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
    const model = buildModel(true);

    await createQuestionGuide({
      messages: [],
      model,
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      reasoning_effort: 'none'
    });
    expect(createLLMResponseMock.mock.calls[0][0].body.model).toBe(model);
  });

  it('does not set reasoning effort for non-reasoning models', async () => {
    const model = buildModel(false);

    await createQuestionGuide({
      messages: [],
      model,
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
    expect(createLLMResponseMock.mock.calls[0][0].body.model).toBe(model);
  });
});
