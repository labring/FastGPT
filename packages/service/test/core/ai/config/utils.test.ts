import { describe, expect, it } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import {
  desensitizeSystemModel,
  desensitizeSystemDefaultModels
} from '../../../../core/ai/config/utils';
import { flatModelToDocumentData } from '../../../../core/ai/config/repair';

describe('flatModelToDocumentData', () => {
  it('moves type-specific fields into config and normalizes plugin maxTokens', () => {
    const result = flatModelToDocumentData({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'gpt-test',
      name: 'GPT test',
      maxContext: 128000,
      maxTokens: 8192,
      quoteMaxToken: 100000,
      vision: true,
      isActive: true
    });

    expect(result).toEqual({
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'gpt-test',
      name: 'GPT test',
      isSystem: true,
      isActive: true,
      config: {
        maxContext: 128000,
        maxResponse: 8192,
        quoteMaxToken: 100000,
        vision: true
      }
    });
    expect(result).not.toHaveProperty('maxTokens');
    expect(result).not.toHaveProperty('vision');
  });

  it('lets persisted config override flat plugin defaults without dropping false and zero', () => {
    const result = flatModelToDocumentData({
      type: ModelTypeEnum.embedding,
      provider: 'OpenAI',
      model: 'embedding-test',
      name: 'Embedding test',
      defaultToken: 500,
      maxToken: 8000,
      weight: 100,
      vision: true,
      config: { weight: 0, vision: false, batchSize: 0 }
    });

    expect(result.config).toMatchObject({
      defaultToken: 500,
      maxToken: 8000,
      weight: 0,
      vision: false,
      batchSize: 0
    });
  });
});

describe('system model response filtering', () => {
  it('removes server-only fields from a model without mutating the source', () => {
    const model = {
      modelId: '68ad85a7463006c963799a68',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'gpt-test',
      name: 'GPT test',
      isSystem: true as const,
      isCustom: false,
      requestUrl: 'https://provider.example/v1',
      requestAuth: 'model-secret',
      config: {
        maxContext: 4096,
        maxResponse: 1024,
        quoteMaxToken: 1024,
        defaultSystemChatPrompt: 'internal prompt',
        defaultConfig: { secret: 'internal config' },
        fieldMap: { messages: 'prompt' }
      }
    };

    const result = desensitizeSystemModel(model);

    expect(result).toMatchObject({
      ...model,
      config: {
        defaultSystemChatPrompt: undefined,
        defaultConfig: undefined,
        fieldMap: undefined
      },
      requestUrl: undefined,
      requestAuth: undefined
    });
    expect(model.requestAuth).toBe('model-secret');
    expect(JSON.stringify(result)).not.toContain('model-secret');
  });

  it('sanitizes system defaults without changing their configured model', () => {
    const model = {
      modelId: '68ad85a7463006c963799a68',
      type: ModelTypeEnum.llm,
      provider: 'OpenAI',
      model: 'configured-model',
      name: 'Configured model',
      isSystem: true as const,
      isCustom: false,
      requestUrl: 'https://provider.example/v1',
      requestAuth: 'configured-secret',
      config: {
        maxContext: 4096,
        maxResponse: 1024,
        quoteMaxToken: 1024,
        defaultConfig: { secret: 'internal config' },
        fieldMap: { messages: 'prompt' }
      }
    };

    const result = desensitizeSystemDefaultModels({ llm: model });

    expect(result.llm).toMatchObject({
      type: ModelTypeEnum.llm,
      model: 'configured-model',
      requestUrl: undefined,
      requestAuth: undefined,
      config: {
        defaultConfig: undefined,
        fieldMap: undefined
      }
    });
    expect(JSON.stringify(result)).not.toContain('configured-secret');
  });
});
