import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import {
  desensitizeSystemDefaultModels,
  desensitizeSystemModel
} from '../../../../core/ai/config/desensitize';

describe('system model response filtering', () => {
  it('removes server-only fields without mutating the source model', () => {
    const model = {
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'gpt-test',
      name: 'GPT test',
      maxContext: 4096,
      maxResponse: 1024,
      quoteMaxToken: 1024,
      requestUrl: 'https://provider.example/v1',
      requestAuth: 'model-secret',
      defaultSystemChatPrompt: 'internal prompt',
      defaultConfig: { secret: 'internal config' },
      fieldMap: { messages: 'prompt' }
    } satisfies LLMModelItemType;

    const result = desensitizeSystemModel(model);

    expect(result).toMatchObject({
      ...model,
      defaultSystemChatPrompt: undefined,
      defaultConfig: undefined,
      fieldMap: undefined,
      requestUrl: undefined,
      requestAuth: undefined
    });
    expect(model.requestAuth).toBe('model-secret');
    expect(JSON.stringify(result)).not.toContain('model-secret');
  });

  it('keeps configured default models while removing server-only fields', () => {
    const model = {
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'configured-model',
      name: 'Configured model',
      maxContext: 4096,
      maxResponse: 1024,
      quoteMaxToken: 1024,
      requestAuth: 'configured-secret'
    } satisfies LLMModelItemType;

    const result = desensitizeSystemDefaultModels({ llm: model });

    expect(result.llm).toMatchObject({
      type: ModelTypeEnum.llm,
      model: 'configured-model',
      requestAuth: undefined
    });
    expect(JSON.stringify(result)).not.toContain('configured-secret');
  });
});
