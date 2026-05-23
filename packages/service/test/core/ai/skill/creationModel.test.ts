import { afterEach, describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { getSkillCreationLLMModel } from '@fastgpt/service/core/ai/skill/manage/creation/model';

const originalSystemDefaultModel = global.systemDefaultModel;

const buildLlmModel = (model: string, isDefault = false): LLMModelItemType => ({
  type: ModelTypeEnum.llm,
  model,
  name: model,
  avatar: model,
  isActive: true,
  isDefault,
  isCustom: false,
  provider: 'OpenAI',
  functionCall: false,
  toolChoice: false,
  maxContext: 4096,
  maxResponse: 4096,
  quoteMaxToken: 2048
});

describe('skill creation model selection', () => {
  afterEach(() => {
    global.systemDefaultModel = originalSystemDefaultModel;
  });

  it('uses the helper bot model resolved from HELPER_BOT_MODEL', () => {
    const systemModel = buildLlmModel('system-default-model', true);
    const helperModel = buildLlmModel('helper-env-model');

    global.systemDefaultModel = {
      ...global.systemDefaultModel,
      llm: systemModel,
      helperBotLLM: helperModel
    };

    expect(getSkillCreationLLMModel()).toBe('helper-env-model');
  });

  it('falls back to the system default LLM when helper bot model is missing', () => {
    const systemModel = buildLlmModel('system-default-model', true);

    global.systemDefaultModel = {
      ...global.systemDefaultModel,
      llm: systemModel,
      helperBotLLM: undefined
    };

    expect(getSkillCreationLLMModel()).toBe('system-default-model');
  });
});
