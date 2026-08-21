import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import {
  desensitizeSystemModel,
  desensitizeSystemDefaultModels,
  normalizeRuntimeSystemModelConfig
} from '../../../../core/ai/config/utils';

describe('normalizeRuntimeSystemModelConfig', () => {
  it('removes a null maxTemperature from the final LLM model', () => {
    const result = normalizeRuntimeSystemModelConfig({
      type: ModelTypeEnum.llm,
      model: 'test-llm',
      maxTemperature: null
    });

    expect(result).not.toHaveProperty('maxTemperature');
  });

  it('preserves a valid LLM maxTemperature', () => {
    const result = normalizeRuntimeSystemModelConfig({
      type: ModelTypeEnum.llm,
      maxTemperature: 1.2
    });

    expect(result.maxTemperature).toBe(1.2);
  });

  it('does not normalize fields on non-LLM models', () => {
    const result = normalizeRuntimeSystemModelConfig({
      type: ModelTypeEnum.embedding,
      maxTemperature: null
    });

    expect(result.maxTemperature).toBeNull();
  });
});

describe('system model response filtering', () => {
  it('removes server-only fields from a model without mutating the source', () => {
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

  it('sanitizes system defaults without changing their configured model', () => {
    const model = {
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'configured-model',
      name: 'Configured model',
      maxContext: 4096,
      maxResponse: 1024,
      quoteMaxToken: 1024,
      requestUrl: 'https://provider.example/v1',
      requestAuth: 'configured-secret',
      defaultConfig: { secret: 'internal config' },
      fieldMap: { messages: 'prompt' }
    } satisfies LLMModelItemType;

    const result = desensitizeSystemDefaultModels({ llm: model });

    expect(result.llm).toMatchObject({
      type: ModelTypeEnum.llm,
      model: 'configured-model',
      requestUrl: undefined,
      requestAuth: undefined,
      defaultConfig: undefined,
      fieldMap: undefined
    });
    expect(JSON.stringify(result)).not.toContain('configured-secret');
  });
});
