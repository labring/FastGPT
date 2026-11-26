import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';

const { createLLMResponseMock } = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';

describe('createQuestionGuide', () => {
  const buildModel = (overrides: Partial<LLMModelDataType['config']> = {}): LLMModelDataType => ({
    modelId: '507f1f77bcf86cd799439013',
    provider: 'openai',
    model: overrides.reasoning ? 'deepseek-r1' : 'gpt-4o',
    name: overrides.reasoning ? 'DeepSeek R1' : 'GPT-4o',
    type: ModelTypeEnum.llm,
    scope: 'system' as const,
    isActive: true,
    config: {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 30000,
      ...overrides
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

  it('uses the lowest supported reasoning effort for reasoning models', async () => {
    const disableableModel = buildModel({
      reasoning: true,
      reasoningEffort: true,
      reasoningEffortList: ['none', 'high']
    });

    await createQuestionGuide({
      messages: [],
      model: disableableModel,
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[0][0].body).toMatchObject({
      reasoning_effort: 'none'
    });
    expect(createLLMResponseMock.mock.calls[0][0].body.model).toBe(disableableModel);

    const minLevelModel = buildModel({
      reasoning: true,
      reasoningEffort: true,
      reasoningEffortList: ['minimal', 'low', 'medium', 'high']
    });

    await createQuestionGuide({
      messages: [],
      model: minLevelModel,
      teamId: 'team_1'
    });

    expect(createLLMResponseMock.mock.calls[1][0].body).toMatchObject({
      reasoning_effort: 'minimal'
    });
  });

  it('does not set reasoning effort when reasoning or reasoningEffort is unsupported', async () => {
    for (const model of [
      buildModel({ reasoning: false }),
      buildModel({ reasoning: true, reasoningEffort: false })
    ]) {
      createLLMResponseMock.mockClear();
      await createQuestionGuide({
        messages: [],
        model,
        teamId: 'team_1'
      });

      expect(createLLMResponseMock.mock.calls[0][0].body).not.toHaveProperty('reasoning_effort');
      expect(createLLMResponseMock.mock.calls[0][0].body.model).toBe(model);
    }
  });
});
